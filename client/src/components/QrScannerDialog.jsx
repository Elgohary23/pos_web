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

// ZXing يقرأ الـ barcodes الخطية (Code128/EAN…) ومكتبة jsQR ممتازة لـ QR.
// نقوم بتحميلهما عند الطلب لتفادي تضخيم حزمة البداية.
let fileDecoderPromise = null
function loadFileDecoders() {
  if (!fileDecoderPromise) {
    fileDecoderPromise = Promise.all([
      import('@zxing/library'),
      import('jsqr').then((mod) => mod.default || mod),
    ]).then(([ZXing, jsQR]) => ({ ZXing, jsQR }))
  }
  return fileDecoderPromise
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('تعذر قراءة الصورة.'))
    img.src = src
  })
}

function decodeCanvasPass(canvas, ZXing, jsQR) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  // 1. فحص رمز QR بواسطة jsQR (دقيق وسريع للـ QR حتى مع الانعكاس)
  if (typeof jsQR === 'function') {
    try {
      const qrRes = jsQR(imgData.data, canvas.width, canvas.height, {
        inversionAttempts: 'attemptBoth',
      })
      if (qrRes?.data) return qrRes.data
    } catch {}
  }

  // 2. فحص الباركود الخطي بواسطة ZXing مع تفعيل TRY_HARDER وخوارزميتين للثنائية
  if (ZXing) {
    const len = canvas.width * canvas.height
    const rgb = new Int32Array(len)
    for (let i = 0; i < len; i++) {
      const r = imgData.data[i * 4]
      const g = imgData.data[i * 4 + 1]
      const b = imgData.data[i * 4 + 2]
      rgb[i] = (255 << 24) | (r << 16) | (g << 8) | b
    }
    const source = new ZXing.RGBLuminanceSource(rgb, canvas.width, canvas.height)
    const hints = new Map()
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true)
    const reader = new ZXing.MultiFormatReader()
    reader.setHints(hints)

    // HybridBinarizer (للصور العامة) و GlobalHistogramBinarizer (ممتاز لسكرين شوت الباركود والخلفيات الفاتحة)
    const binarizers = [
      new ZXing.HybridBinarizer(source),
      new ZXing.GlobalHistogramBinarizer(source),
    ]

    for (const b of binarizers) {
      try {
        const bitmap = new ZXing.BinaryBitmap(b)
        const res = reader.decode(bitmap)
        if (res?.getText?.()) return res.getText()
      } catch {}
    }
  }

  return null
}

async function scanImageElement(img, ZXing, jsQR) {
  // المحاولة الأولى: الحجم الأصلي على خلفية بيضاء
  const c1 = document.createElement('canvas')
  c1.width = img.naturalWidth
  c1.height = img.naturalHeight
  const ctx1 = c1.getContext('2d', { willReadFrequently: true })
  ctx1.fillStyle = '#ffffff'
  ctx1.fillRect(0, 0, c1.width, c1.height)
  ctx1.drawImage(img, 0, 0)

  let text = decodeCanvasPass(c1, ZXing, jsQR)
  if (text) return text

  // المحاولة الثانية: تغيير المقياس (للصور فائقة الدقة مثل شاشات 2K/4K أو الصور الصغيرة المقتطعة)
  const scales = [1.5, 2.0, 0.75, 0.5]
  for (const s of scales) {
    const sw = Math.round(img.naturalWidth * s)
    const sh = Math.round(img.naturalHeight * s)
    if (sw < 40 || sh < 40 || sw > 4000 || sh > 4000) continue

    const cs = document.createElement('canvas')
    cs.width = sw
    cs.height = sh
    const ctxS = cs.getContext('2d', { willReadFrequently: true })
    ctxS.fillStyle = '#ffffff'
    ctxS.fillRect(0, 0, sw, sh)
    ctxS.imageSmoothingEnabled = true
    ctxS.drawImage(img, 0, 0, sw, sh)
    text = decodeCanvasPass(cs, ZXing, jsQR)
    if (text) return text
  }

  // المحاولة الثالثة: تحسين التباين والتدرج الرمادي (لمعالجة anti-aliasing في لقطات الشاشة)
  const cContrast = document.createElement('canvas')
  cContrast.width = img.naturalWidth
  cContrast.height = img.naturalHeight
  const ctxC = cContrast.getContext('2d', { willReadFrequently: true })
  ctxC.fillStyle = '#ffffff'
  ctxC.fillRect(0, 0, cContrast.width, cContrast.height)
  ctxC.drawImage(img, 0, 0)
  const idC = ctxC.getImageData(0, 0, cContrast.width, cContrast.height)
  let minL = 255
  let maxL = 0
  for (let i = 0; i < idC.data.length; i += 4) {
    const l = Math.round(0.299 * idC.data[i] + 0.587 * idC.data[i + 1] + 0.114 * idC.data[i + 2])
    if (l < minL) minL = l
    if (l > maxL) maxL = l
  }
  if (maxL > minL + 25) {
    const range = maxL - minL
    for (let i = 0; i < idC.data.length; i += 4) {
      const l = 0.299 * idC.data[i] + 0.587 * idC.data[i + 1] + 0.114 * idC.data[i + 2]
      const stretched = Math.min(255, Math.max(0, Math.round(((l - minL) / range) * 255)))
      idC.data[i] = stretched
      idC.data[i + 1] = stretched
      idC.data[i + 2] = stretched
    }
    ctxC.putImageData(idC, 0, 0)
    text = decodeCanvasPass(cContrast, ZXing, jsQR)
    if (text) return text
  }

  return null
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
      if (!code) return false
      if (deliveredRef.current) return true
      deliveredRef.current = true
      onResult(code)
      return true
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

  // ---------- قراءة صورة من الملفات أو لقطات الشاشة ----------
  const scanFile = useCallback(
    async (file) => {
      if (!file) return
      setFileError('')
      setFileBusy(true)
      await stopCamera()

      let objectUrl = ''
      try {
        const { ZXing, jsQR } = await loadFileDecoders()
        objectUrl = URL.createObjectURL(file)
        const img = await loadImageElement(objectUrl)

        const text = await scanImageElement(img, ZXing, jsQR)
        if (!text) throw new Error('NO_CODE_IN_IMAGE')

        const ok = deliver(text)
        if (!ok) {
          setFileError(`تم العثور على رمز (${text.length > 25 ? text.slice(0, 25) + '...' : text}) ولكنه لا يطابق كود منتج أو رابط صالح.`)
        }
      } catch (err) {
        if (err?.message === 'NO_CODE_IN_IMAGE') {
          setFileError('لم يتم العثور على باركود أو كود QR واضح في الصورة. تأكد من وضوح الصورة وقرب الرمز.')
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

  // دعم لصق لقطة الشاشة مباشرةً من الحافظة (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            setMode('file')
            scanFile(file)
            break
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [scanFile])

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
              اختر صورة الرمز (QR أو باركود) أو الصقها (Ctrl+V)
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
            {fileBusy && <div className="qr-status">جارٍ قراءة الصورة وتحليل الرمز...</div>}
            {fileError && <div className="qr-error">{fileError}</div>}
            <div className="qr-hint">
              يمكنك رفع صورة، أو أخذ سكرين شوت والضغط مباشرة على <strong>Ctrl+V</strong> للصقها وفحصها فوراً. القراءة تتم محلياً في جهازك.
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={handleClose}>إغلاق</button>
        </div>
      </div>
    </div>
  )
}
