# Generates a Windows-compatible multi-size ICO (BMP DIBs + 256 PNG)
# from build/icon.png, with circular transparency.

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root 'build\icon.png'
if (-not (Test-Path $srcPath)) {
  throw "Missing source icon: $srcPath"
}

function Load-ArgbBitmap([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  $ms = New-Object IO.MemoryStream(,$bytes)
  $img = [System.Drawing.Image]::FromStream($ms)
  $bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
  $g.Dispose()
  $img.Dispose()
  $ms.Dispose()
  return $bmp
}

function Apply-CircleMask([System.Drawing.Bitmap]$src) {
  $w = $src.Width
  $h = $src.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $cx = ($w - 1) / 2.0
  $cy = ($h - 1) / 2.0
  $radius = ([Math]::Min($w, $h) / 2.0) - 0.5
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $dx = $x - $cx
      $dy = $y - $cy
      $dist = [Math]::Sqrt(($dx * $dx) + ($dy * $dy))
      $i = ($y * $stride) + ($x * 4)
      if ($dist -ge ($radius + 1)) {
        $bytes[$i + 3] = 0
      } elseif ($dist -gt ($radius - 1)) {
        $t = ($radius + 1 - $dist) / 2.0
        if ($t -lt 0) { $t = 0 }
        if ($t -gt 1) { $t = 1 }
        $bytes[$i + 3] = [byte][Math]::Round($bytes[$i + 3] * $t)
      }
    }
  }
  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
  $src.UnlockBits($data)
}

function Resize-Bitmap([System.Drawing.Bitmap]$src, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  return $bmp
}

function Get-DibBytes([System.Drawing.Bitmap]$bmp) {
  $w = $bmp.Width
  $h = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $srcBytes = New-Object byte[] ($stride * $h)
  [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $srcBytes, 0, $srcBytes.Length)
  $bmp.UnlockBits($data)

  $xorStride = $w * 4
  $andStride = [int][Math]::Ceiling($w / 32.0) * 4
  $ms = New-Object IO.MemoryStream
  $bw = New-Object IO.BinaryWriter $ms
  $bw.Write([UInt32]40)
  $bw.Write([Int32]$w)
  $bw.Write([Int32]($h * 2))
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]0)
  $bw.Write([UInt32](($xorStride * $h) + ($andStride * $h)))
  $bw.Write([Int32]0)
  $bw.Write([Int32]0)
  $bw.Write([UInt32]0)
  $bw.Write([UInt32]0)
  for ($y = $h - 1; $y -ge 0; $y--) {
    $bw.Write($srcBytes, ($y * $stride), $xorStride)
  }
  $andRow = New-Object byte[] $andStride
  for ($y = 0; $y -lt $h; $y++) {
    $bw.Write($andRow)
  }
  $bw.Flush()
  return $ms.ToArray()
}

function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
  $ms = New-Object IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  return $ms.ToArray()
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
  $tmp = Join-Path $dir ([IO.Path]::GetRandomFileName() + '.png')
  $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  Move-Item -Force $tmp $path
}

$source = Load-ArgbBitmap $srcPath
Apply-CircleMask $source
Save-Png $source (Join-Path $root 'build\icon.png')
Save-Png $source (Join-Path $root 'src\assets\app-icon.png')
Save-Png $source (Join-Path $root 'public\icon.png')

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = New-Object System.Collections.Generic.List[object]
foreach ($size in $sizes) {
  $resized = Resize-Bitmap $source $size
  if ($size -ge 256) {
    $bytes = Get-PngBytes $resized
  } else {
    $bytes = Get-DibBytes $resized
  }
  $images.Add([pscustomobject]@{ w = $size; h = $size; bytes = $bytes })
  $resized.Dispose()
}
$source.Dispose()

$count = $images.Count
$headerSize = 6 + (16 * $count)
$offset = $headerSize
$ms = New-Object IO.MemoryStream
$bw = New-Object IO.BinaryWriter $ms
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$count)
foreach ($img in $images) {
  $wByte = if ($img.w -ge 256) { [byte]0 } else { [byte]$img.w }
  $hByte = if ($img.h -ge 256) { [byte]0 } else { [byte]$img.h }
  $bw.Write($wByte)
  $bw.Write($hByte)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]$img.bytes.Length)
  $bw.Write([UInt32]$offset)
  $offset += $img.bytes.Length
}
foreach ($img in $images) {
  $payload = [byte[]]$img.bytes
  $bw.BaseStream.Write($payload, 0, $payload.Length)
}
$bw.Flush()
$icoBytes = $ms.ToArray()
[IO.File]::WriteAllBytes((Join-Path $root 'build\icon.ico'), $icoBytes)
[IO.File]::WriteAllBytes((Join-Path $root 'public\favicon.ico'), $icoBytes)
Write-Output ("Wrote ICO {0} bytes, {1} sizes" -f $icoBytes.Length, $count)
