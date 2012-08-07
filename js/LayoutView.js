var LayoutView = (function _LayoutView ($) {

  return Layout.extend({
    socket: null,
    options: {
      // The row names
      showLabels: true,
      // Socket.io socket for connections
      socket: null
    },
    classes: {
      seat: 'seat',
      hovered: 'hovered',
      marked: 'marked',
      reserved: 'reserved',
      locked: 'locked',
      rowName: 'row-name',
      empty: 'empty',
      blank: 'blank'
    },
    init: function LayoutView (_options, _classes) {
      var that = this;

      that._super(_options);
      $.extend(that.options, _options);
      $.extend(that.classes, _classes);

      var components = $.extend(that.getComponents(), {
        maxColumns: 0,
        table: null
      });

      if (!that.options.socket) {
        console.warn('[LayoutView.init] No socket specificed');
        return null;
      }

      that.socket = that.options.socket;

      // create the DOM elements
      createTable(that);

      // attach the events on the cells
      bindEvents(that);
    },
    /**
     * Set the state of the layout to a specific point
     * @param {Object} setup
     */
    loadState: function _loadState (setup) {
      var that = this;
      var components = that.getComponents();
      that._super(setup);
      var actualMap = components.map;
      that.init();
      if (setup.map) {
        for (var row in actualMap) {
          for (var column in actualMap[row]) {
            switch (actualMap[row][column]) {
              case that.TYPES.LOCKED:
                that.lock(row, column);
                break;
              case that.TYPES.EMPTY:
                // Do Nothing
                break;
              case that.TYPES.RESERVED:
                that.reserve(row, column);
                break;
              default:
              case that.TYPES.BLANK:
                // Do Nothing
                break;
            }
          }
        }
      }
    },
    /**
     * Returns the jQuery element at the given position
     * @param {String} row
     * @param {String} column
     * @returns {jQuery}
     */
    getCell: function _getCell (row, column) {
      if (arguments.length < 2) {
        console.warn('[LayoutView.getCell] Not enough arguments');
        return null;
      }
      return this.getComponents().table.find('#'+this.makeID(row, column));
    },
    /**
     * Changes the type of the field
     * @param {String} row
     * @param {String} column
     * @param {Function} async If not null, the method checks the result
     *    with the server and runs the async callback on error
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    lock: function _lock (row, column, async) {
      var that = this;
      var seatID = that.makeID(row, column);
      if (that.getType(row, column) === that.TYPES.EMPTY) {
        that.locks[seatID] = true;
        this.getCell(row, column).addClass(this.classes.locked);
        if (async) {
          async = typeof async === 'function' ? async : function (err, newType){
            that.unlock(row, column);
            console.warn('[Layout.lock(async)] Server conflict: `' +
                          layout.getEnumName(newType) +
                          '`. <br />' + err
            );
          };
          var oldType = that._super(row, column);
          if (oldType) {
            that.socket.emit('lock', row, column, async);
          }
          return oldType;
        } else {
          that.makeEmpty(row, column);
          return that.setType(row, column, that.TYPES.LOCKED);
        }
      }
      console.warn('[LayoutView.lock] Seat `' + seatID + '` not empty!');
      return null;
    },
    /**
     * Changes the type of the field to empty only if it is locked.
     * @param {String} row
     * @param {String} column
     * @param {Function} async If not null, the method checks the result
     *    with the server and updates the fields upon conflict
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    unlock: function _unlock (row, column, async) {
      var that = this;
      var seatID = that.makeID(row, column);
      if (that.getType(row, column) === that.TYPES.LOCKED) {
        if (that.locks[seatID]) {
          delete that.locks[seatID];
          this.getCell(row, column).removeClass(this.classes.locked);
          if (async) {
            async = typeof async==='function' ? async : function (err, newType){
              console.warn('[Layout.unlock(async)] Server conflict: `' +
                            layout.getEnumName(newType) +
                            '`. <br />' + err
              );
            };
            var oldType = that._super(row, column);
            if (oldType) {
              that.socket.emit('unlock', row, column, async);
            }
            return oldType;
          } else {
            return that.setType(row, column, that.TYPES.EMPTY);
          }
        } else {
          console.warn('[LayoutView.unlock] Lock on `' + seatID +
                        '` not set by this instance');
        }
      }
      console.warn('[LayoutView.unlock] Seat `' + seatID + '` not locked!');
      return null;
    },
    /**
     * Sets the type of the field to TYPES.LOCKED without sanity checks
     *  Used to signal other instances' locking
     * @param {String} row
     * @param {String} column
     * @param {String} name
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    outerLock: function _outerLock (row, column, name) {
      this.getCell(row, column)
        .attr('outer-lock', name)
        .addClass(this.classes.locked);
      this.makeEmpty(row, column);
      return this.setType(row, column, this.TYPES.LOCKED);
    },
    /**
     * Changes the type of the field to empty only if locked with outerLock
     *  Similar to LayoutView.unlock
     * @param {String} row
     * @param {String} column
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    outerUnlock: function _outerUnlock (row, column) {
      var seatID = this.makeID(row, column);
      if (this.getType(row, column) === this.TYPES.LOCKED) {
        if (!this.locks[seatID]) {
          this.getCell(row, column)
            .removeAttr('outer-lock')
            .removeClass(this.classes.locked);
          return this.setType(row, column, this.TYPES.EMPTY);
        } else {
          console.warn('[LayoutView.outerUnlock] `' + seatID + '` locked with' +
                        ' LayoutView.lock. Use LayoutView.unlock for it');
        }
      }
      console.warn('[LayoutView.outerUnlock] Seat `' + seatID + '` not locked');
      return null;
    },
    /**
     * Changes the type of the field. Shorthand for setType(...)
     * @param {String} row
     * @param {String} column
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    reserve: function _reserve (row, column) {
      this.makeEmpty(row, column);
      this.getCell(row, column).addClass(this.classes.reserved);
      this.makeEmpty(row, column);
      return this.setType(row, column, this.TYPES.RESERVED);
    },
    /**
     * Applies all undo methods until the field has the thype TYPES.EMPTY
     * @param {String} row
     * @param {String} column
     * @param {Function} async If not null, the method checks the result
     *    with the server and updates the fields upon conflict
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    makeEmpty: function _makeEmpty (row, column, async) {
      var oldType = this.getType(row, column);
      var skip = false;

      // if it an outer-lock
      if (oldType===this.TYPES.LOCKED && !this.locks[this.makeID(row, column)]){
        oldType = this.outerUnlock(row, column);
        skip = true;
      }
      this._super(row, column);

      return skip ? oldType :
                    this.setType(row, column, this.TYPES.EMPTY);
    },
    /**
     * Change the type of a cell in the map.
     *  NOTE: This should really not be used externally
     * @param {String} row
     * @param {String} column
     * @param {Enum Layout.TYPES|Int} type
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    setType: function _setType (row, column, type) {
      var that = this;
      return this._super(row, column, type);
      return null;
    },
    /**
     * @returns The jQuery element representation of the Class
     */
    toElement: function _toElement () {
      return this.getComponents().table;
    }
  });

  function bindEvents (that) {
    that.getComponents().table
      .find('.'+that.classes.seat)
      .on({
        mouseenter: function selectPrevSiblings(){
          $(this)
            .addClass(that.classes.hovered)
            .prevAll(':not(.'+that.classes.rowName+')')
            .addClass(that.classes.marked);
        },
        mouseleave: function resetSelection(){
          $(this)
            .removeClass(that.classes.hovered)
            .prevAll(':not(.'+that.classes.rowName+')')
            .removeClass(that.classes.marked);
        }
      });
  }

  /**
   * Generate DOM table form the components.map and saves it in components.table
   * @param {Layout} that
   */
  function createTable (that) {
    var components = that.getComponents();
    var $table = jqElement('table');
    for(var i in components.map){
      var $tr = jqElement('tr');
      if (that.options.showLabels) {
        $tr.append(
          jqElement('td').attr({
            'id': that.makeID(i, 0),
            'class': that.classes.rowName
          })
          .html(i)
        );
      }
      for (var j in components.map[i]) {
        var $td = jqElement('td');
        $td.attr({
          'id': that.makeID(i, j)
        });
        if(components.map[i][j] !== that.TYPES.BLANK){
          $td.html(j)
            .addClass(that.classes.seat)
            .addClass(that.getEnumName(components.map[i][j]).toLowerCase());
        } else {
          $td.addClass(that.classes.blank);
        }
        $tr.append( $td );
      }
      $table.append( $tr );
    }
    components.table = $table;
  }

  function jqElement (type) {
    return $(document.createElement(type));
  }

}(jQuery));