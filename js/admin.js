var menu;

// window ready
$(function _initializeAdminLayout () {
  socket.on('loadState', function _onLoadState () {
    setupMenu();
    menu.reserve.name.val('Tester');
    menu.reserve.email.val('theTest@testy.de');

    addAdminEvents();
  });
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

      if (Object.keys(layout.locks).length === 0) {
        statusUpdate('No seats selected!', null, 'error');
      } else if (!name || name.length < 4) {
        menu.reserve.name.focus();
        statusUpdate('Name must have at least 4 characters', null, 'error');
      } else if (!email || !emailRegExp.test(email)) {
        menu.reserve.email.focus();
        statusUpdate('Invalid email', null, 'error');
      } else {
        var seats = Object.keys(layout.locks);
        if (confirm('Reserving the following seats: ' + seats.join(', '))) {
          socket.emit('reserve', name, email, seats, function (result, error) {
            if (error) {
              statusUpdate(error, 'error');
            } else {
              var seats = Object.keys(result.codes);
              var reservationObject = $.extend({}, result);
              delete reservationObject.codes;
              reservationObject.seats = seats;
              registerReservation(reservationObject);
              seats.sort();
              var codes = [];
              for (var i=0; i<seats.length; ++i) {
                codes.push(
                  '<tr>' +
                    '<td><b>'+ seats[i] +':</b></td>'+
                    '<td> ' + result.codes[seats[i]] + '</td>' +
                  '</tr>'
                );
              };
              statusUpdate(
                'Reservation complete! ',
                (!result.number ? '' :
                  '<div><b>number:</b> ' + result.number + '</div>') +
                  (!result.name ? '' :
                  '<div><b>name:</b> ' + result.name + '</div>') +
                  (!result.email ? '' :
                    '<div><b>email:</b> ' + result.email + '</div>') +
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

function addAdminEvents () {
  var $seats = layout.toElement().find('.'+layout.classes.seat);
  $seats
    .on('click.lock', function _selectSeat () {
      var id = $(this).attr('id');
      var arr = id.split('-');
      var row = arr[0];
      var column = arr[1];
      switch (layout.getType(row, column)) {
        case layout.TYPES.EMPTY:
          layout.lock(row, column, function _onConflict (error, newType) {
            layout.unlock(row, column);
            statusUpdate( 'Could not lock seat `' + id + '`',
                          'It is `' + layout.getEnumName(newType) + '`.<br />' +
                            error +
                            ' <b>You should refresh the page ...</b>'
            );
          });
          break;
        case layout.TYPES.LOCKED:
          if (layout.locks[id]) {
            layout.unlock(row, column, true);
          } else {
            statusUpdate('The seat `' + id + '` is locked by somebody else');
          }
          break;
        default:
          // Do nothing
      }
      menu.reserve.name.focus();
    });
}