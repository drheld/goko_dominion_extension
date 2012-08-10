$(document).ready(function() {
  $('body').append('<div id="logs"></div>');
  $('#logs').css('display', 'none');

  var code =
  "<script> \
    Dom.LogManager.prototype.realAddLog = Dom.LogManager.prototype.addLog; \
    Dom.LogManager.prototype.addLog = function(options) { \
      $('#logs').append('<div>' + options.text + '</div>'); \
      this.realAddLog(options); \
    }; \
  </script>";

  $('body').append(code);
});
