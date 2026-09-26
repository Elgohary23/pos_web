import { useCallback, useEffect, useRef, useState } from 'react'
import { extractScanCode } from '../utils/scanCode.js'

// المكتبات ثقيلة (~250 كيلوبايت لكل واحدة) ولا نحتاجها إلا عند المسح فعليًا،
// فحمّلها عند الطلب حتى لا تدخل في الحزمة الأساسية.
let scannerModulePromise = null
function loadHtml5Qrcode() {
  if (!scannerModulePromise) {
    scannerModulePromise = import('html5-qrcode').then((mod) => mod.Html5Qrcode)
  }
  return scannerModulePromise
}

// ZXing يقرأ الـ barcodes الخطية (Code128/EAN…) وهو مُضمَّن داخل html5-qrcode،
// لكن مُكتشف QR فيه ضعيف ويفشل على كثير من صور الـ QR. لذلك نقرأ الصورة مرتين:
// ZXing للخطية أولًا، ثم jsQR للـ QR — وكلاهما يُحمَّل عند الطلب.
let fileDecoderPromise = null
function loadFileDecoders() {
  if (!fileDecoderPromise) {
    fileDecoderPromise = Promise.all([
      import('@zxing/library').then((mod) => mod.BrowserMultiFormatReader),
      import('jsqr').then((mod) => mod.default || mod),
    ]).then(([ZxingMultiFormatReader, jsQR]) => ({ ZxingMultiFormatReader, jsQR }))
  }
  return fileDecoderPromise
}

// بعض الصور (PNG) بخلفية شفافة؛ ZXing يقرأ الشفافية كأنها سواد فيفشل،
// فنفرض خلفية بيضاء قبل التحليل.
function flattenOnWhite(img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return { canvas, ctx }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('تعذر قراءة الصورة.'))
    img.src = src
  })
}

// كل فتح للقارئ يولّد معرّفات عناصر جديدة — المكتبة تبحث عنها بـ getElementById
// فيجب أن تكون فريدة لكل نسخة من النافذة.
let dialogSeq = 0

const SCAN_FPS = 10
const MAX_QR_BOX = 260
const MIN_QR_BOX = 140

// الكاميرا الخلفية أولًا (موبايل) ثم الأمامية. المكتبة لا تقبل خيار «أي كاميرا»
// لذا نجرّب بالترتيب ونكتفي بأول محاولة ناجحة.
const CAMERA_CANDIDATES = [
  { facingMode: 'environment' },
  { facingMode: 'user' },
]

const CAMERA_ERROR_MESSAGES = {
  NotAllowedError: 'تم رفض إذن الكاميرا. اسمح للمتصفح باستخدام الكاميرا من إعدادات الموقع ثم أعد المحاولة.',
  PermissionDeniedError: 'تم رفض إذن الكاميرا. اسمح للمتصفح باستخدام الكاميرا من إعدادات الموقع ثم أعد المحاولة.',
  SecurityError: 'المتصفح منع الوصول للكاميرا لأسباب أمنية. استخدم «رفع صورة» بدلًا من ذلك.',
  NotFoundError: 'لا توجد كاميرا متاحة على هذا الجهاز. استخدم «رفع صورة» بدلًا من ذلك.',
  DevicesNotFoundError: 'لا توجد كاميرا متاحة على هذا الجهاز. استخدم «رفع صورة» بدلًا من ذلك.',
  NotReadableError: 'الكاميرا مستخدمة من برنامج آخر. أغلقه ثم أعد المحاولة.',
  TrackStartError: 'تعذر تشغيل الكاميرا. استخدم «رفع صورة» بدلًا من ذلك.',
  OverconstrainedError: 'الكاميرا المطلوبة غير متاحة. استخدم «رفع صورة» بدلًا من ذلك.',
}

function describeCameraError(err) {
  const name = err && typeof err === 'object' ? err.name : ''
  if (name && CAMERA_ERROR_MESSAGES[name]) return CAMERA_ERROR_MESSAGES[name]
  return 'تعذر تشغيل الكاميرا على هذا الجهاز. يمكنك استخدام «رفع صورة» لقراءة الكود من صورة.'
}

function describeScanError(err) {
  const text = typeof err === 'string' ? err : err?.message || ''
  if (/busy|ongoing/i.test(text)) return 'الكاميرا تعمل بالفعل — بدّل إلى «رفع صورة» لقراءة الصورة.'
  return 'لم يتم العثور على كود واضح في الصورة. جرّب صورة أقرب أو أوضح.'
}

function isCameraSupported() {
  return typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export default function QrScannerDialog({ onResult, onClose, title = 'مسح الكود' }) {
  const [ids] = useState(() => {
    dialogSeq += 1
    const n = dialogSeq
    return { reader: `qr-reader-${n}`, file: `qr-file-reader-${n}` }
  })

  const [mode, setMode] = useState('camera')
  const [cameraStatus, setCameraStatus] = useState('idle') // idle | starting | running | error
  const [cameraError, setCameraError] = useState('')
  const [cameraRetry, setCameraRetry] = useState(0)
  const [fileError, setFileError] = useState('')
  const [fileBusy, setFileBusy] = useState(false)
  const [insecure, setInsecure] = useState(() => Boolean(window.isSecureContext) === false)

  const scannerRef = useRef(null)
  const startingRef = useRef(null)
  const fileInputRef = useRef(null)
  const deliveredRef = useRef(false)

  const deliver = useCallback(
    (text) => {
      // A printed label carries both a Code128 (raw code) and a QR (deep link),
      // so the payload is normalised before it leaves the dialog - callers only
      // ever deal with a bare barcode.
      const code = extractScanCode(text)
      if (!code || deliveredRef.current) return
      deliveredRef.current = true
      onResult(code)
    },
    [onResult]
  )

  // نقفل الكاميرا أولًا ثم نُزيل عنصر الفيديو. أثناء بدء التشغيل قد يكون
  // القارئ لم يُسجَّل بعد، لذا نراجع startingRef حتى لا يبقى تدفق الكاميرا
  // مفتوحًا إذا أُغلقت النافذة في تلك اللحظة.
  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current || startingRef.current
    scannerRef.current = null
    startingRef.current = null
    if (!scanner) return
    try {
      await scanner.stop()
    } catch {
      // قد تكون متوقفة أصلًا — نتجاهل
    }
    try {
      // ملاحظة: clear() في المكتبة متزامنة ولا تُرجع Promise
      scanner.clear()
    } catch {
      // العنصر أُزيل مسبقًا — نتجاهل
    }
  }, [])

  const scanConfig = {
    fps: SCAN_FPS,
    disableFlip: true,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const side = Math.max(
        MIN_QR_BOX,
        Math.min(Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8), MAX_QR_BOX)
      )
      return { width: side, height: side }
    },
  }

  // ---------- دورة حياة الكاميرا: تبدأ مع فتح النافذة ومع كل تبديل إلى تبويب الكاميرا ----------
  useEffect(() => {
    if (mode !== 'camera') {
      stopCamera()
      return undefined
    }

    let cancelled = false
    setCameraError('')

    if (!isCameraSupported()) {
      setCameraStatus('error')
      setCameraError('الكاميرا غير مدعومة في هذا المتصفح. استخدم «رفع صورة» بدلًا من ذلك.')
      return undefined
    }
    if (!window.isSecureContext) {
      setCameraStatus('error')
      setCameraError(
        'المتصفح يسمح بالكاميرا فقط عبر اتصال آمن (https) أو على localhost. استخدم «رفع صورة» بدلًا من ذلك.'
      )
      return undefined
    }

    setCameraStatus('starting')

    const run = async () => {
      let Html5Qrcode
      try {
        Html5Qrcode = await loadHtml5Qrcode()
      } catch {
        if (cancelled) return
        setCameraStatus('error')
        setCameraError('تعذر تحميل مكوّن المسح. حدّث الصفحة وحاول مرة أخرى.')
        return
      }
      if (cancelled) return

      for (const candidate of CAMERA_CANDIDATES) {
        let scanner = null
        try {
          scanner = new Html5Qrcode(ids.reader, { verbose: false })
          scannerRef.current = scanner
          startingRef.current = scanner
          await scanner.start(
            candidate,
            scanConfig,
            (decodedText) => {
              stopCamera()
              setCameraStatus('idle')
              deliver(decodedText)
            },
            () => {
              // أخطاء البحث عن كود أثناء المسح طبيعية — نتجاهلها بصمت
            }
          )
          if (startingRef.current === scanner) startingRef.current = null
          if (cancelled) {
            await stopCamera()
            return
          }
          setCameraStatus('running')
          return
        } catch (err) {
          const interrupted = /interrupted|removed from the document|AbortError/i.test(err?.message || '')
          if (startingRef.current === scanner) startingRef.current = null
          if (scannerRef.current === scanner) scannerRef.current = null
          try {
            scanner?.clear()
          } catch {
            // تجاهل
          }
          // إغلاق النافذة أثناء تشغيل الكاميرا يُبطل عنصر الفيديو فيرفض المتصفح
          // تشغيله ويطلق rejection غير مفيد — نعتبره إلغاءً متعمدًا لا خطأ.
          if (cancelled || interrupted) return
          setCameraStatus('error')
          setCameraError(describeCameraError(err))
          return
        }
      }
    }

    run()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [mode, cameraRetry, ids.reader, deliver, stopCamera])

  // ---------- قراءة صورة من الملفات ----------
  // ZXing أولًا (الباركود الخطية هو ما تنتجه هذه)، وإن لم يجد نستخدم jsQR للـ QR.
  const scanFile = useCallback(
    async (file) => {
      if (!file) return
      setFileError('')
      setFileBusy(true)
      await stopCamera()

      let objectUrl = ''
      try {
        const { ZxingMultiFormatReader, jsQR } = await loadFileDecoders()
        objectUrl = URL.createObjectURL(file)
        const img = await loadImageElement(objectUrl)
        const { canvas, ctx } = flattenOnWhite(img)

        let text = ''
        try {
          const reader = new ZxingMultiFormatReader(new Map(), {
            delayBetweenScanAttempts: 0,
            delayBetweenScanSuccess: 0,
          })
          const result = await reader.decodeFromImageUrl(canvas.toDataURL('image/png'))
          text = result?.getText?.() || ''
        } catch {
          // لا يوجد باركود خطي — نجرّب قراءة QR
        }

        if (!text && typeof jsQR === 'function') {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          text = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          })?.data || ''
        }

        if (!text) throw new Error('NO_CODE_IN_IMAGE')
        deliver(text)
      } catch (err) {
        if (err?.message === 'NO_CODE_IN_IMAGE') {
          setFileError('لم يتم العثور على كود واضح في الصورة. جرّب صورة أقرب أو أوضح.')
        } else {
          setFileError(describeScanError(err))
        }
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        setFileBusy(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [deliver, stopCamera]
  )

  // ---------- الإغلاق ----------
  // نوقف الكاميرا قبل إزالة النافذة من DOM، وإلا رفض المتصفح تشغيل عنصر
  // الفيديو المحذوف وطلع rejection غير مفيد في الـ console.
  const handleClose = useCallback(async () => {
    await stopCamera()
    onClose()
  }, [onClose, stopCamera])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-box modal-wide qr-modal" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="modal-close" onClick={handleClose} aria-label="إغلاق">✕</button>
        <h2>{title}</h2>
        <p className="modal-text">وجّه الكاميرا إلى رمز QR أو الباركود، أو ارفع صورة تحتوي عليه.</p>

        <div className="qr-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'camera'}
            className={'qr-mode-tab' + (mode === 'camera' ? ' active' : '')}
            onClick={() => setMode('camera')}
          >
            📷 الكاميرا
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'file'}
            className={'qr-mode-tab' + (mode === 'file' ? ' active' : '')}
            onClick={() => setMode('file')}
          >
            🖼️ رفع صورة
          </button>
        </div>

        {/* عنصر قارئ الكاميرا يبقى mounted في كل الأوضاع: لو أُزيل أثناء
            تشغيل الكاميرا رفض المتصفح تشغيل الفيديو المحذوف وطلع خطأ في الـ console. */}
        <div id={ids.reader} className={'qr-reader-region' + (mode === 'camera' ? '' : ' qr-reader-hidden')} />

        {mode === 'camera' && (
          <>
            {cameraStatus === 'starting' && <div className="qr-status">جارٍ تشغيل الكاميرا...</div>}
            {cameraStatus === 'running' && (
              <div className="qr-status qr-status-ok">الكاميرا تعمل — قرّب الرمز من الإطار</div>
            )}
            {cameraError && (
              <div className="qr-error">
                <span>{cameraError}</span>
                <div className="qr-error-actions">
                  <button type="button" className="btn-secondary btn-compact" onClick={() => setMode('file')}>
                    رفع صورة
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    onClick={() => setCameraRetry((n) => n + 1)}
                  >
                    إعادة المحاولة
                  </button>
                </div>
              </div>
            )}
            {insecure && cameraStatus === 'error' && (
              <div className="qr-hint">
                عند الدخول من الموبايل عبر عنوان IP الشبكة تكون الصفحة غير آمنة، ولا يسمح المتصفح بتشغيل الكاميرا.
                استخدم «رفع صورة» أو اكتب الكود يدويًا.
              </div>
            )}
          </>
        )}

        {mode === 'file' && (
          <div className="qr-file-pane">
            <label className="qr-file-label" htmlFor={`${ids.file}-input`}>
              اختر صورة الرمز (QR أو باركود)
            </label>
            <input
              id={`${ids.file}-input`}
              ref={fileInputRef}
              className="qr-file-input"
              type="file"
              accept="image/*"
              disabled={fileBusy}
              onChange={(e) => scanFile(e.target.files?.[0])}
            />
            {fileBusy && <div className="qr-status">جارٍ قراءة الصورة...</div>}
            {fileError && <div className="qr-error">{fileError}</div>}
            <div className="qr-hint">القراءة تتم داخل المتصفح على جهازك، ولا يتم رفع أي صورة إلى الخادم.</div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={handleClose}>إغلاق</button>
        </div>
      </div>
    </div>
  )
}
