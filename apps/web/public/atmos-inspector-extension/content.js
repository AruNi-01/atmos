(function () {
  function inject(file) {
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL(file);
    script.async = false;
    script.onload = function () {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
    (document.head || document.documentElement).appendChild(script);
  }

  inject('preview-runtime.js');
  inject('injected.js');
}());

