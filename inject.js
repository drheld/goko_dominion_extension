$(document).ready(function() { var hook = function() {
  // Note: The above line is a single line in order to get accurate
  // line numbers for error messages.

  // TODO(drheld): Add try/catch around everything in this section so this
  // can't bust the game with an exception.

  var sequence = 0;
  var websocket_wrapper;

  // Boilerplate to read websocket traffic and pass through to the extension.
  function hookWebSocket() {
    // Adapted from: http://sla.ckers.org/forum/read.php?6,35771,35771
    window.WebSocket = function(oldWebSocket) {
      return function WrappedWebSocket(loc) {
        this.prototype = new oldWebSocket(loc);
        this.__proto__ = this.prototype;
        websocket_wrapper = this;
        this.onmessage = function(message) {
          var data = message.data;
          handleMessage(data);
          websocket_wrapper.trueonmessage({data: data});
        };
        this.__defineSetter__('onmessage', function(val) {
          websocket_wrapper.trueonmessage = val;
        });
        this.send = function(data) {
          handleMessage(data);
          this.prototype.send(data);
        };
      };
    }(window.WebSocket);
  }

  hookWebSocket();

  function handleMessage(raw_data) {
    // Pass through to extension.
    $('#socket_messages').append(
        $('<div id=socket_message_"' + sequence++ + ">").text(raw_data));

    // Unfortunately we need to parse the message to figure out enough to send messages.
    var msg = $.parseJSON(raw_data);
    if (msg.message == 'GameMessage') {
      var outerdata = msg.data;
      var msgname = outerdata.messageName;
      var gmdata = outerdata.data;
      if (msgname == 'gameSetup') {
        userID = msg.destination;
        gameID = msg.source;
        myName = gmdata.playerInfos[gmdata.playerIndex].name;
      }
    }
  }

  // Pass through log messages as they're added.
  Dom.LogManager.prototype.realAddLog = Dom.LogManager.prototype.addLog;
  Dom.LogManager.prototype.addLog = function(options) {
    $('#logs').append('<div>' + options.text + '</div>');
    this.realAddLog(options);
  };

  // Send / receive events as triggered.
  $('#text_to_send').bind('DOMNodeInserted', function(event) {
    var node = $(event.target);
    console.log(node.text());
    websocket_wrapper.send(node.text());
    node.remove();
  });
  $('#text_to_receive').bind('DOMNodeInserted', function(event) {
    var node = $(event.target);
    console.log(node.text());
    websocket_wrapper.prototype.onmessage({data:node.text()});
    node.remove();
  });

  function sendChat(text) {
    // Send to others.
    var msg = {
      'message': 'GameMessage',
      'version': 1,
      'tag': '',
      'source': userID,
      'destination': gameID,
      'data': {
        'messageName': 'sendChat',
        'data': {
          'text': text
        }
      }
    };
    var data = JSON.stringify(msg);
    websocket_wrapper.send(data);

    // Send to me.
    var msg = {
      'message': 'GameMessage',
      'version': 1,
      'tag': '',
      'source': gameID,
      'destination': userID,
      'data': {
        'messageName': 'addChat',
        'data': {
          'playerName': myName,
          'text': text
        }
      }
    };
    var data = JSON.stringify(msg);
    console.log(data);
    websocket_wrapper.prototype.onmessage({data: data});
  }
}

// Boilerplate to run in page context (important for hooking the websocket).
var runInPageContext = function(fn) {
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.textContent = '('+ fn +')();';
  document.body.appendChild(script);
}

$('body').append($('<div id="logs">').css('display', 'none'));
$('body').append($('<div id="socket_messages">').css('display', 'none'));
$('body').append($('<div id="text_to_send">').css('display', 'none'));
$('body').append($('<div id="text_to_receive">').css('display', 'none'));

runInPageContext(hook);

});
