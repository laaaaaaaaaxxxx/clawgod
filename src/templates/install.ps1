# Manual offline copy installer. No PATH mutation or Claude discovery.
# Required: --target <absolute bridge copy> --output-dir <absolute new output>
$ErrorActionPreference = 'Stop'
$Installer = @'
{{CLAWGOD:INSTALLER}}
'@
$Installer | & node - @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
