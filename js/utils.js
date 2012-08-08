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
        '-moz-user-select': 'none',
        '-webkit-user-select': 'none',
        'user-select': 'none',
        '-ms-user-select': 'none'
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
    target: null,
    // the slideToggle speed
    speed: 400
  }, _options);
  return this.each(function () {
    var button = $(document.createElement('a'));
    var parent = $(this);
    var target = options.target ? $(this).find(options.target) : null;
    var targetHeight = null;

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
          target.stop().slideUp(options.speed);
        } else {
          button.html('-');
          target.stop().slideDown(options.speed, function _restoreHeight () {
            target.css('height', targetHeight);
          });
        }
      });

    target.addClass('collapsible-target');

    parent
      .addClass('collapsible-parent')
      .append(button);
    targetHeight = target.css('height');
  });
}