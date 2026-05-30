# Bakes the Image Placeholder sprite: a 16:9 PNG with translucent sky-blue 45°
# stripes + a dashed border + a centered image/mountain icon. Matches the
# editor's ImagePlaceholderOverlay (renderSlot.tsx) so editor and in-game agree.
# Output is content-addressed: saved as Images/sprites/<sha256-of-bytes>.
Add-Type -AssemblyName System.Drawing

$W = 1024; $H = 576
$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# White/grayscale so the sprite can be cleanly TINTED at export with the active
# theme's bodyTextColor (legible on every theme). Image.Tint multiplies the
# sprite, so a white sprite × themeColor == themeColor at these alphas.
$sky = @(255,255,255)
$lite = @(255,255,255)

# Soft light base so the placeholder reads as a distinct frosted card once tinted.
$lightBase = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38, 255, 255, 255))
$g.FillRectangle($lightBase, 0, 0, $W, $H)

# Base wash (editor: rgba(56,189,248,0.08))
$baseBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, $sky[0], $sky[1], $sky[2]))
$g.FillRectangle($baseBrush, 0, 0, $W, $H)

# 45° stripes: every other band gets a second wash → ~0.16 alpha (editor match).
$state = $g.Save()
$g.TranslateTransform([single]($W/2), [single]($H/2))
$g.RotateTransform(45)
$stripeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, $sky[0], $sky[1], $sky[2]))
for ($x = -1300; $x -le 1300; $x += 22) {
  $g.FillRectangle($stripeBrush, [single]$x, [single](-1300), [single]11, [single]2600)
}
$g.Restore($state)

# Dashed border (editor: 2px dashed rgba(56,189,248,0.6), inset)
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(153, $sky[0], $sky[1], $sky[2]), 4)
$pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Custom
$pen.DashPattern = @([single]14, [single]10)
$g.DrawRectangle($pen, 12, 12, ($W - 24), ($H - 24))

# Centered image icon (24-unit viewBox scaled to 144px). Same shapes as the
# editor SVG: rounded rect + lens circle + mountain polyline.
$iconSize = 144.0
$scale = $iconSize / 24.0
$state2 = $g.Save()
$g.TranslateTransform([single](($W - $iconSize) / 2), [single](($H - $iconSize) / 2))
$g.ScaleTransform([single]$scale, [single]$scale)
$ipen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(217, $lite[0], $lite[1], $lite[2]), 1.6)
$ipen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$ipen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ipen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round

# Rounded rect x=3 y=3 w=18 h=18 r=2
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = 4.0
$path.AddArc(3, 3, $d, $d, 180, 90)
$path.AddArc((3 + 18 - $d), 3, $d, $d, 270, 90)
$path.AddArc((3 + 18 - $d), (3 + 18 - $d), $d, $d, 0, 90)
$path.AddArc(3, (3 + 18 - $d), $d, $d, 90, 90)
$path.CloseFigure()
$g.DrawPath($ipen, $path)

# Lens circle cx=8.5 cy=9 r=1.5
$g.DrawEllipse($ipen, 7.0, 7.5, 3.0, 3.0)

# Mountain polyline M21 16 L16 11 L5 21
$pts = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(21, 16),
  [System.Drawing.PointF]::new(16, 11),
  [System.Drawing.PointF]::new(5, 21)
)
$g.DrawLines($ipen, $pts)
$g.Restore($state2)

$g.Dispose()

$tmp = Join-Path $PSScriptRoot "_placeholder.tmp.png"
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$bytes = [System.IO.File]::ReadAllBytes($tmp)
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLower()
$dest = Join-Path $PSScriptRoot "..\Images\sprites\$hash"
[System.IO.File]::WriteAllBytes($dest, $bytes)
Remove-Item $tmp -Force

Write-Output "HASH=$hash"
Write-Output "BYTES=$($bytes.Length)"
Write-Output "DEST=$dest"
