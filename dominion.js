// Map from player name to Player object.
var players = new Object();

var started = false;
var disabled = false;
var turn_number = 0;
var player_count = 0;

var show_action_count = false;
var show_unique_count = false;
var show_victory_count = false;
var show_duchy_count = false;

var had_error = false;
var announced_error = false;

var player_re = null;

var userID;
var gameID;
var myName;

var send_sequence = 0;
var receive_sequence = 0;

var last_status_print = 0;

// The version of the extension currently loaded.
var extension_version = 'Unknown';

// Quotes a string so it matches literally in a regex.
RegExp.quote = function(str) {
  return str.replace(/([.?*+^$[\]\\(){}-])/g, "\\$1");
};

function debugString(thing) {
  return JSON.stringify(thing);
}

function handleError(text) {
  console.log(text);
  if (!had_error) {
    had_error = true;
    alert("Point counter error. Results may no longer be accurate: " + text);
  }
}

function maybeAnnounceFailure(text) {
  if (!disabled && !announced_error) {
    console.log("Logging error: " + text);
    writeText(text);
  }
  announced_error = true;
}

function pointsForCard(card_name) {
  if (card_name == undefined) {
    handleError("Undefined card for points...");
    return 0;
  }
  if (card_name.indexOf("Colony") == 0) return 10;
  if (card_name.indexOf("Province") == 0) return 6;
  if (card_name.indexOf("Duchy") == 0) return 3;
  if (card_name.indexOf("Estate") == 0) return 1;
  if (card_name.indexOf("Curse") == 0) return -1;

  if (card_name.indexOf("Island") == 0) return 2;
  if (card_name.indexOf("Nobles") == 0) return 2;
  if (card_name.indexOf("Harem") == 0) return 2;
  if (card_name.indexOf("Great Hall") == 0) return 1;

  if (card_name.indexOf("Farmland") == 0) return 2;
  if (card_name.indexOf("Tunnel") == 0) return 2;
  return 0;
}

function Player(name) {
  this.name = name;
  this.score = 3;
  this.deck_size = 10;

  // Map from special counts (such as number of gardens) to count.
  this.special_counts = { "Treasure" : 7, "Victory" : 3, "Uniques" : 2 };
  this.card_counts = { "Copper" : 7, "Estate" : 3 };

  this.getScore = function() {
    var score_str = this.score;
    var total_score = this.score;

    if (this.card_counts["Gardens"] != undefined) {
      var gardens = this.card_counts["Gardens"];
      var garden_points = Math.floor(this.deck_size / 10);
      score_str = score_str + "+" + gardens + "g@" + garden_points;
      total_score = total_score + gardens * garden_points;
    }

    if (this.card_counts["Silk Road"] != undefined) {
      var silk_roads = this.card_counts["Silk Road"];
      var silk_road_points = 0;
      if (this.special_counts["Victory"] != undefined) {
        silk_road_points = Math.floor(this.special_counts["Victory"] / 4);
      }
      score_str = score_str + "+" + silk_roads + "s@" + silk_road_points;
      total_score = total_score + silk_roads * silk_road_points;
    }

    if (this.card_counts["Duke"] != undefined) {
      var dukes = this.card_counts["Duke"];
      var duke_points = 0;
      if (this.card_counts["Duchy"] != undefined) {
        duke_points = this.card_counts["Duchy"];
      }
      score_str = score_str + "+" + dukes + "d@" + duke_points;
      total_score = total_score + dukes * duke_points;
    }

    if (this.card_counts["Vineyard"] != undefined) {
      var vineyards = this.card_counts["Vineyard"];
      var vineyard_points = 0;
      if (this.special_counts["Actions"] != undefined) {
        vineyard_points = Math.floor(this.special_counts["Actions"] / 3);
      }
      score_str = score_str + "+" + vineyards + "v@" + vineyard_points;
      total_score = total_score + vineyards * vineyard_points;
    }

    if (this.card_counts["Fairgrounds"] != undefined) {
      var fairgrounds = this.card_counts["Fairgrounds"];
      var fairgrounds_points = 0;
      if (this.special_counts["Uniques"] != undefined) {
        fairgrounds_points = Math.floor(this.special_counts["Uniques"] / 5) * 2;
      }
      score_str = score_str + "+" + fairgrounds + "f@" + fairgrounds_points;
      total_score = total_score + fairgrounds * fairgrounds_points;
    }

    if (total_score != this.score) {
      score_str = score_str + "=" + total_score;
    }
    return score_str;
  }

  this.getDeckString = function() {
    var str = this.deck_size;
    var need_action_string = (show_action_count && this.special_counts["Actions"]);
    var need_unique_string = (show_unique_count && this.special_counts["Uniques"]);
    var need_victory_string = (show_victory_count && this.special_counts["Victory"]);
    var need_duchy_string = (show_duchy_count && this.card_counts["Duchy"]);
    if (need_action_string || need_unique_string || need_duchy_string || need_victory_string) {
      var special_types = [];
      if (need_unique_string) {
        special_types.push(this.special_counts["Uniques"] + "u");
      }
      if (need_action_string) {
        special_types.push(this.special_counts["Actions"] + "a");
      }
      if (need_duchy_string) {
        special_types.push(this.card_counts["Duchy"] + "d");
      }
      if (need_victory_string) {
        special_types.push(this.special_counts["Victory"] + "v");
      }
      str += '(' + special_types.join(", ") + ')';
    }
    return str;
  }

  this.changeScore = function(points) {
    this.score = this.score + parseInt(points);
  }

  this.changeSpecialCount = function(name, delta) {
    if (this.special_counts[name] == undefined) {
      this.special_counts[name] = 0;
    }
    this.special_counts[name] = this.special_counts[name] + delta;
  }

  this.recordCards = function(name, count) {
    if (this.card_counts[name] == undefined || this.card_counts[name] == 0) {
      this.card_counts[name] = count;
      this.special_counts["Uniques"] += 1;
    } else {
      this.card_counts[name] += count;
    }

    if (this.card_counts[name] <= 0) {
      if (this.card_counts[name] < 0) {
        handleError("Card count for " + name + " is negative (" + this.card_counts[name] + ")");
      }
      delete this.card_counts[name];
      this.special_counts["Uniques"] -= 1;
    }
  }

  this.recordSpecialCounts = function(singular_card_name, card, count) {
    // TODO(drheld): Implement based on rrenaud's list.
  }

  this.gainCard = function(card, count) {
    count = parseInt(count);
    this.deck_size = this.deck_size + count;

    this.changeScore(pointsForCard(card) * count);
    this.recordSpecialCounts(card, count);
    this.recordCards(card, count);
  }
}

function stateStrings() {
  var state = '';
  for (var player in players) {
    player = players[player];
    state += '<b>' + player.name + "</b>: " +
        player.getScore() + " points [deck size is " +
        player.getDeckString() + "] - " +
        JSON.stringify(player.special_counts) + "<br>" +
        JSON.stringify(player.card_counts) + "<br>";
  }
  return state;
}

function getPlayer(name) {
  if (players[name] == undefined) return null;
  return players[name];
}

function maybeHandleTurnChange(text) {
  // TODO
}

function maybeHandleGameStart(text) {
  if (text != "------------ Game Setup ------------") {
    return false;
  }

  started = true;
  disabled = false;
  turn_number = 0;
  player_count = 0;

  // TODO(drheld): Decide here.
  show_action_count = false;
  show_unique_count = false;
  show_victory_count = false;
  show_duchy_count = false;

  had_error = false;
  announced_error = false;

  players = new Object();
  introducePlugin();

  return true;
}

function maybeHandlePlayerStart(text) {
  var arr = text.match(/^(.*) - starting cards:/);
  if (!arr || arr.length != 2) return false;
  players[arr[1]] = new Player(arr[1]);
  players[arr[1]].id = "player" + ++player_count;

  var player_names = [];
  for (player in players) {
    player_names.push(RegExp.quote(players[player].name));
  }
  player_re = new RegExp('^(' + player_names.join('|') + ') - (.*)$');

  return true;
}

function handleLogEntry(text) {
  if (maybeHandleGameStart(text)) return;
  if (!started) return;
  if (maybeHandlePlayerStart(text)) return;
  if (maybeHandleTurnChange(text)) return;

  var split = text.match(player_re);
  if (!split) return;

  var player = getPlayer(split[1]);
  var entry = split[2];

  // Handle gain.
  var arr = entry.match(/^gains (.*)$/);
  if (arr) {
    player.gainCard(arr[1], 1);
    return;
  }

  // Handle trash.
  var arr = entry.match(/^trashes (.*)$/);
  if (arr) {
    player.gainCard(arr[1], -1);
    return;
  }

  // Handle return to supply.
  var arr = entry.match(/^returns (.*) to the Supply$/);
  if (arr) {
    player.gainCard(arr[1], -1);
    return;
  }

  // Handle points.
  var arr = entry.match(/^receives ([0-9]*) victory point chips$/);
  if (arr) {
    player.changeScore(arr[1]);
    return;
  }
}

function getDecks() {
  var decks = "Cards: ";
  for (var player in players) {
    decks += playerString(players[player], players[player].getDeckString());
  }
  return decks;
}

function updateDeck() {
  if (deck_spot == undefined) {
    var spot = $('a[href="/signout"]');
    if (spot.length != 1) return;
    deck_spot = spot[0];
  }
  ignore_events = true;
  deck_spot.innerHTML = getDecks();
  ignore_events = false;
}

function introducePlugin() {
  writeText("★ Cards counted by Dominion Point Counter ★");
  writeText("http://goo.gl/iDihS (screenshot: http://goo.gl/G9BTQ)");
  writeText("Type !status to see the current score.");
  writeText("Type !details to see deck details for each player.");
  // TODO(drheld): Options.
  //if (getOption("allow_disable")) {
  //  writeText("Type !disable by turn 5 to disable the point counter.");
  //}
}

function maybeShowStatus(request_time) {
  if (last_status_print < request_time) {
    last_status_print = new Date().getTime();

    // Build up a string to show.
    var to_show = " >> Decks: ";
    for (var player in players) {
      to_show += " " + players[player].name + "=" + players[player].getDeckString();
    }
    to_show += " | Points: "
    for (var player in players) {
      to_show += " " + players[player].name + "=" + players[player].getScore();
    }

    var my_name = localStorage["name"];
    if (my_name == undefined || my_name == null) my_name = "Me";
    writeText(to_show.replace(/You=/g, my_name + "="));
  }
}

function maybeShowDetails(request_time) {
  if (last_status_print < request_time) {
    last_status_print = new Date().getTime();

    var my_name = localStorage["name"];
    if (my_name == undefined || my_name == null) my_name = "Me";

    for (var player in players) {
      player = players[player];
      var name = player.name == "You" ? my_name : player.name;
      writeText('>> *' + name + '* => ' + player.getScore() +
                ' points [deck size is ' + player.getDeckString() + '] - ' +
                JSON.stringify(player.special_counts));
      writeText('>>    ' + JSON.stringify(player.card_counts));
    }
  }
}

function hideExtension() {
  // TODO(drheld)
}

function delayedRunCommand(command) {
  var time = new Date().getTime();
  var command = command + "(" + time + ")";
  var wait_time = 200 * Math.floor(Math.random() * 10 + 1);
  // If we introduced the extension, we get first dibs on answering.
  // TODO(drheld): Re-add this.
  // if (i_introduced) wait_time = 100;
  setTimeout(command, wait_time);
}

function handleChatText(text) {
  if (!text) return;
  if (disabled) return;

  if (text == "!status") delayedRunCommand("maybeShowStatus");
  if (text == "!details") delayedRunCommand("maybeShowDetails");

//  if (getOption("allow_disable") && text == " !disable" && turn_number <= 5) {
//    localStorage.setItem("disabled", "t");
//    disabled = true;
//    hideExtension();
//    writeText(">> Point counter disabled.");
//  }

  if (text.indexOf(" >> ") == 0) {
    last_status_print = new Date().getTime();
  }
  //if (!introduced && text.indexOf(" ★ ") == 0) {
//    introduced = true;
 //   if (speaker == localStorage["name"]) {
//      i_introduced = true;
//    }
//  }
}

function addSetting(setting, output) {
  if (localStorage[setting] != undefined) {
    output[setting] = localStorage[setting];
  }
}
function settingsString() {
  var settings = new Object();
  addSetting("debug", settings);
  addSetting("always_display", settings);
  addSetting("allow_disable", settings);
  addSetting("name", settings);
  addSetting("show_card_counts", settings);
  addSetting("status_announce", settings);
  addSetting("status_msg", settings);
  return JSON.stringify(settings);
}

function handleGameEnd(doc) {
  // TODO
}

function playerString(player, text) {
  return "<span class=" + player.id + ">" + text + "</span>";
}

function showState() {
  var html = '';
  for (player in players) {
    var player = players[player];
    var player_string = player.name + '<br>';
    player_string += 'Cards: ' + player.getDeckString() + '<br>';
    player_string += 'Score: ' + player.getScore() + '<br>';
    html += playerString(player, player_string) + '<br>'
  }
  $('#status').html(html);
}

function handle(text) {
  try {
    handleLogEntry(text);
    if (!started) return;
    showState();
  }
  catch (err) {
    console.log(err);
    console.log(text);
    handleError("Javascript exception: " + err.stack);
  }
}

function handleGameMessage(node) {
  var msg = $.parseJSON(node.text());
  if (msg.message == 'GameMessage') {
    var outerdata = msg.data;
    var msgname = outerdata.messageName;
    var gmdata = outerdata.data;
    if (msgname == 'gameSetup') {
      userID = msg.destination;
      gameID = msg.source;
      myName = gmdata.playerInfos[gmdata.playerIndex].name;
    }
    if (msgname == 'addChat' || msgname == 'sendChat') {
      handleChatText(gmdata.text);
    }
  }
  node.remove();
}

function writeText(text) {
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
  $('#text_to_send').append(
      $('<div id=send_msg_' + send_sequence++ + '>').text(data));

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
  $('#text_to_receive').append(
      $('<div id=receive_msg_' + receive_sequence++ + '>').text(data));
}

//
// Chat status handling.
//

function buildStatusMessage() {
  var status_message = "/me Auto▼Count";
  if (localStorage["status_msg"] != undefined &&
      localStorage["status_msg"] != "") {
    status_message = status_message + " - " + localStorage["status_msg"];
  }
  return status_message;
}

$(document).ready(function() {
  $('body').append('<div id="status"></div>');

  $('#status').css('color', 'white');
  $('#status').css('font-family', 'monospace');

  $('#logs').bind('DOMNodeInserted', function(event) {
    handle($(event.target).text());
  });
  $('#socket_messages').bind('DOMNodeInserted', function(event) {
    handleGameMessage($(event.target));
  });
});

chrome.extension.sendRequest({ type: "version" }, function(response) {
  extension_version = response;
});
