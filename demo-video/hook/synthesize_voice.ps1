param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type -AssemblyName System.Speech
$ErrorActionPreference = 'Stop'

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female)
$synth.Volume = 100
$synth.Rate = -1
$synth.SetOutputToWaveFile($OutputPath)

$ssml = @'
<speak version="1.0" xml:lang="en-US">
  <prosody rate="-2%">
    Computer science classes have not caught up with <emphasis level="moderate">AI</emphasis>.
    <break time="260ms" />
    A student can paste in an entire assignment and get a finished solution in seconds,
    <break time="160ms" />
    bypassing the struggle where real learning happens.
  </prosody>
</speak>
'@

try {
  $synth.SpeakSsml($ssml)
} finally {
  $synth.Dispose()
}
