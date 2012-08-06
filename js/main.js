
var socket = io.connect(config.client.serverAddress ||
                        window.location.protocol +'//'+ window.location.hostname
);
var layout;
var typeList;
var menu;
var $layoutWrapper;

if (typeof String.prototype.trim !== 'function') {
  String.prototype.trim = function _trim () {
    return this.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
  }
}

$.fn.disableSelection = function () {
  return this.each(function () {
    $(this)
      .attr('unselectable', 'on')
      .css({
        '-moz-user-select':'none',
        '-webkit-user-select':'none',
        'user-select':'none',
        '-ms-user-select':'none'
      })
      .each(function () {
        this.onselectstart = function() { return false; };
      });
  });
};

$.fn.collapsible = function (_options) {
  var options = $.extend({
    // if set to a selector and if any children mathching the selector are
    //  found than they will be used as the toggleable container
    target: null
  }, _options);
  return this.each(function () {
    var button = $(document.createElement('a'));
    var parent = $(this);
    var target = options.target ? $(this).find(options.target) : null;

    if (!target || !target.length) {
      $(this).wrap('<div />');
      parent = $(this).parent();
      target = $(this);
    }

    if (parent.css('position') == 'static') {
      parent.css('position', 'relative');
    }

    button
      .data('parent', parent)
      .data('target', target)
      .attr({
        href: 'javascript:void(0)',
        'class': 'collapsible-button'
      })
      .html(target.is(':visible') ? '-' : '+')
      .on('click', function _toggle (event) {
        event.preventDefault();
        if (target.is(':visible')){
          button.html('+');
          target.hide();
        } else {
          button.html('-');
          target.show();
        }
      });

    target.addClass('collapsible-target');

    parent
      .addClass('collapsible-parent')
      .append(button);
  });
}

var classes = {
  selected: 'selected'
};

var selection = {};


// init socket
setupSocket();

// window ready
$(function _initializeLayout () {
  layout = new LayoutView({
    showLabels: true,
    spaces: ['E-F', 'M-N'],
    map: config.map
  });
  typeList = Object.keys(layout.TYPES);
  typeList.unshift(0);

  $layoutWrapper = $('#layout');
  $layoutWrapper.html(layout.toElement());
  addEvents(layout);

  setupMenu();
  menu.reserve.name.val('Tester');
  menu.reserve.email.val('theTest@testy.de');
});

function setupMenu () {
  menu = {
    main: jqElement('div'),
    status: jqElement('ul'),
    reserve: {
      main: jqElement('div'),
      name: jqElement('input'),
      email: jqElement('input'),
      submit: jqElement('input')
    }
  };

  menu.status.attr({
    id: 'status',
    'class': 'section'
  });

  menu.reserve.name.attr({
    type: 'text',
    placeholder: 'name ...'
  });

  menu.reserve.email.attr({
    type: 'text',
    placeholder: 'email ...'
  });

  menu.reserve.submit.attr({
    type: 'button',
    value: 'Reserve'
  });

  menu.reserve.main.attr({
    id: 'reserve',
    'class': 'section'
  }).append(
    menu.reserve.name,
    menu.reserve.email,
    menu.reserve.submit
  );

  menu.reserve.submit
    .on('click.reserve', function _reserve () {
      var name = menu.reserve.name.val().trim();
      var email = menu.reserve.email.val().trim();
      var emailRegExp = /^[a-zA-Z0-9\-_.]+@[a-zA-Z0-9\-_]+\.[a-z]{2,3}$/;

      if (Object.keys(selection).length === 0) {
        statusUpdate('No seats selected!', null, 'error');
      } else if (!name || name.length < 4) {
        menu.reserve.name.focus();
        statusUpdate('Name must have at least 4 characters', null, 'error');
      } else if (!email || !emailRegExp.test(email)) {
        menu.reserve.email.focus();
        statusUpdate('Invalid email', null, 'error');
      } else {
        var seats = Object.keys(selection).map(function _removePrefix (r) {
          return r.slice(layout.options.seatSeparator.length +
                          layout.options.seatPrefix.length);
        });
        if (confirm('Reserving the following seats: '+seats.join(', '))) {
          socket.emit('reserve', name, email, seats, function (result, error){
            if (error) {
              statusUpdate(error, 'error');
            } else {
              reserveSeats(Object.keys(result.codes));
              var codes = [];
              for (var seat in result.codes) {
                codes.push(
                  '<tr>' +
                    '<td><b>'+ seat +':</b></td>'+
                    '<td> ' + result.codes[seat] + '</td>' +
                  '</tr>'
                );
              };
              statusUpdate('Reservation complete! ',
                            '<div><b>number:</b> ' + result.number + '</div>'+
                            '<div><b>name:</b> ' + result.name + '</div>' +
                            '<div><b>email:</b> ' + result.email + '</div>' +
                            '<table>' +
                              '<tr><th colspan="2">Codes:</th></tr>' +
                              codes.join("\n") +
                            '</table>'
              );
            }
          });
        }
      }
    });

  menu.main
    .attr('id', 'menu')
    .insertBefore($layoutWrapper)
    .append(
      menu.status,
      menu.reserve.main
    );
}

function setupSocket () {
  socket.on('loadState', function _onLoadState (state) {
    layout.loadState(state);
    $layoutWrapper.empty();
    $layoutWrapper.html(layout.toElement());
    selection = {};
    addEvents(layout);
  })
  .on('reserve', reserveSeats)
  .on('setType', function _onSetType (row, column, type) {
    var oldType = layout.getType(row, column);
    layout.setType(row, column, type);
  })
  .on('statusUpdate', function _statusUpdate (title, content, type) {
    statusUpdate(title, content, type);
  })
  .on('connect', function _onConnect () {
    console.info('[SOCKET] Connected');
  })
  .on('disconnect', function _onDisconnect () {
    console.info('[SOCKET] Disconnected');
  });
}

function reserveSeats (seats) {
  if (seats.length === 0) {
    return;
  }
  for (var i=0; i<seats.length; ++i) {
    var arr = seats[i].split('-');
    layout.reserve(arr[0], arr[1]);
    delete selection[layout.makeID(arr[0], arr[1])];
  }
}

function statusUpdate (title, content, type) {
  type = type || 'log';
  var li = jqElement('li');
  menu.status.append(
    li.attr('class', type)
      .append(
        jqElement('div')
          .addClass('title')
          .html(title)
      )
  );
  if (content) {
    li.append(
      jqElement('div')
        .addClass('content')
        .html(content)
    );
    li.collapsible({target:'.content'});
  }
  menu.status[0].scrollTop = menu.status[0].scrollHeight;
}

function addEvents (layout) {
  var components = layout.getComponents();
  var $seats = layout.toElement().find('.'+layout.classes.seat);
  layout.toElement().disableSelection();
  $seats
    .on('click.lock', function _selectSeat () {
      var id = $(this).attr('id');
      var arr = id.split('-');
      var row = arr[1];
      var column = arr[2];
      if (layout.getType(row, column) === layout.TYPES.EMPTY) {
        selection[id] = true;
        layout.lock(row, column, function _onConflict (newType) {
          delete selection[id];
          statusUpdate('Could not lock seat `' + row + '-' + column +
                        '`. It is `' + layout.getEnumName(newType) + '`'
          );
        });
      } else if (layout.getType(row, column) === layout.TYPES.LOCKED) {
        delete selection[id];
        layout.unlock(row, column, true);
      } else {
        console.warn('[addEvents] This is bad', this.id, arguments);
      }
      menu.reserve.name.focus();
    });
}

function jqElement (type) {
  return $(document.createElement(type));
}