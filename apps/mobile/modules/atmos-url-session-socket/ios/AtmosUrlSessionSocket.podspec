Pod::Spec.new do |s|
  s.name           = 'AtmosUrlSessionSocket'
  s.version        = '1.0.0'
  s.summary        = 'URLSession WebSocket for the Atmos phone app'
  s.description    = 'Opens Computer and terminal WebSockets with URLSession so they follow the same network path as Relay REST.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'Atmos'
  s.homepage       = 'https://atmos.land'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Foundation'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
