# Generates app.ico (multi-size, PNG-compressed frames) for the installer
# and the desktop/start-menu shortcuts. Pure GDI+ -- no external tools.
param(
  [Parameter(Mandatory = $true)]
  [string]$OutFile
)

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $R * 2
  $p.AddArc($X, $Y, $d, $d, 180, 90)
  $p.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
  $p.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
  $p.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-APPFrame {
  param([int]$Size)
  $fmtPx = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  $bmp = [System.Drawing.Bitmap]::new($Size, $Size, $fmtPx)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [float]$Size
  $m = $s * 0.08
  $rect = New-RoundedRectPath -X $m -Y $m -W ($s - 2 * $m) -H ($s - 2 * $m) -R ($s * 0.20)

  $bounds = [System.Drawing.RectangleF]::new(0, 0, $s, $s)
  $c1 = [System.Drawing.Color]::FromArgb(255, 34, 197, 94)
  $c2 = [System.Drawing.Color]::FromArgb(255, 21, 128, 61)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($bounds, $c1, $c2, 90.0)
  $g.FillPath($brush, $rect)
  $brush.Dispose()
  $rect.Dispose()

  # Bold "K" glyph
  $font = [System.Drawing.Font]::new("Segoe UI", ($s * 0.44), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $txtRect = [System.Drawing.RectangleF]::new($m, $s * 0.05, ($s - 2 * $m), $s * 0.58)
  $fmt = [System.Drawing.StringFormat]::new()
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString("K", $font, [System.Drawing.Brushes]::White, $txtRect, $fmt)

  # Barcode bars below the glyph (POS feel)
  $barTop = $s * 0.66
  $barH = $s * 0.16
  $patterns = @(3, 1, 2, 4, 1, 3, 2, 1, 4, 2)
  $innerX = $s * 0.30
  $innerW = $s * 0.40
  $cursor = $innerX
  $total = ($patterns | Measure-Object -Sum).Sum
  $gauge = $innerW / $total
  foreach ($n in $patterns) {
    $w = $n * $gauge
    $g.FillRectangle([System.Drawing.Brushes]::White, $cursor, $barTop, $w, $barH)
    $cursor += $w + $gauge * 0.5
  }

  $fmt.Dispose()
  $font.Dispose()
  $g.Dispose()

  $ms = [System.IO.MemoryStream]::new()
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [byte[]]$bytes = $ms.ToArray()
  $ms.Dispose()
  $bmp.Dispose()
  Write-Output -NoEnumerate $bytes
}

function Write-ICO {
  param([string]$Path, [object[]]$Frames)
  $sizes = @(256, 128, 64, 48, 32, 24, 16)
  $fs = [System.IO.File]::Create($Path)
  try {
    $bw = [System.IO.BinaryWriter]::new($fs)

    $bw.Write([uint16]0)             # reserved
    $bw.Write([uint16]1)             # type: icon
    $bw.Write([uint16]$sizes.Count)  # image count

    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
      [byte[]]$bytes = $Frames[$i]
      $dim = 0
      if ($sizes[$i] -lt 256) { $dim = $sizes[$i] }
      $bw.Write([byte]$dim)           # width (0 = 256)
      $bw.Write([byte]$dim)           # height (0 = 256)
      $bw.Write([byte]0)              # palette
      $bw.Write([byte]0)              # reserved
      $bw.Write([uint16]1)            # color planes
      $bw.Write([uint16]32)           # bits per pixel
      $bw.Write([uint32]$bytes.Length)
      $bw.Write([uint32]$offset)
      $offset += $bytes.Length
    }
    foreach ($frame in $Frames) {
      [byte[]]$bytes = $frame
      $bw.Write($bytes)
    }
    $bw.Flush()
    $bw.Dispose()
  } finally {
    $fs.Dispose()
  }
}

$frames = @()
foreach ($s in @(256, 128, 64, 48, 32, 24, 16)) {
  $frames += ,(New-APPFrame -Size $s)
}
Write-ICO -Path $OutFile -Frames $frames
Write-Host "Icon written: $OutFile"