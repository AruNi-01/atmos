Pod::Spec.new do |s|
  s.name           = 'AtmosScrollEdge'
  s.version        = '1.0.0'
  s.summary        = 'Hides iOS 26 scroll edge effects inside chat'
  s.description    = 'UIScrollEdgeEffect draws a blur on every scroll view. Chat hides it on the transcript and the pill row, which are not the screen first-descendant scroll view.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'Atmos'
  s.homepage       = 'https://atmos.land'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'UIKit'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
