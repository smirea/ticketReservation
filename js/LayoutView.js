var LayoutView = (function _LayoutView ($) {

  return Layout.extend({
    options: {
      showLabels: true,
      spaces: [],
      seatPrefix: 'cell',
      seatSeparator: '-'
    },
    classes: {
      seat: 'seat',
      hovered: 'hovered',
      marked: 'marked',
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
        table: null,
        spaces: that.options.spaces.map(function (r) { return r.split('-'); })
      });

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
                //that.makeEmpty(row, column);
                break;
              case that.TYPES.RESERVED:
                that.reserve(row, column);
                break;
              default:
              case that.TYPES.BLANK:
                // Do Nothing
            }
          }
        }
      }
    },
    /**
     * Returns the id of the seat at a specific position.
     * NOTE: Does not check if the seat actually exists!
     * @param {String} row
     * @param {String} column
     * @returns {String}
     */
    makeID: function _makeID (row, column) {
      var opt = this.options;
      return [opt.seatPrefix, row, column].join(opt.seatSeparator);
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
     * @param {Function} asyncCallback If not null, the method checks the result
     *    with the server and updates the fields upon conflict
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    lock: function _lock (row, column, asyncCallback) {
      var method = asyncCallback ? 'setTypeAsync' : 'setType';
      return this[method](row, column, this.TYPES.LOCKED, asyncCallback);
    },
    /**
     * Changes the type of the field to empty only if it is locked.
     * @param {String} row
     * @param {String} column
     * @param {Function} asyncCallback If not null, the method checks the result
     *    with the server and updates the fields upon conflict
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    unlock: function _unlock (row, column, asyncCallback) {
      if (this.getType(row, column) === this.TYPES.LOCKED) {
        return this.makeEmpty(row, column, asyncCallback);
      }
      console.warn('[LayoutView.unlock] Seat `'+row+'-'+column+'` not locked!');
      return null;
    },
    /**
     * Changes the type of the field. Shorthand for setType(...)
     * @param {String} row
     * @param {String} column
     * @param {Function} asyncCallback If not null, the method checks the result
     *    with the server and updates the fields upon conflict
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    reserve: function _reserve (row, column, asyncCallback) {
      var method = asyncCallback ? 'setTypeAsync' : 'setType';
      return this[method](row, column, this.TYPES.RESERVED, asyncCallback);
    },
    /**
     * Changes the type of the field. Shorthand for setType(...)
     * @param {String} row
     * @param {String} column
     * @param {Function} asyncCallback If not null, the method checks the result
     *    with the server and updates the fields upon conflict
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    makeEmpty: function _makeEmpty (row, column, asyncCallback) {
      var method = asyncCallback ? 'setTypeAsync' : 'setType';
      return this[method](row, column, this.TYPES.EMPTY, asyncCallback);
    },
    /**
     * Change the type of a cell in the map
     * @param {String} row
     * @param {String} column
     * @param {Enum Layout.TYPES|Int} type
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    setType: function _setType (row, column, type) {
      var that = this;
      var oldType = this._super(row, column, type);
      if (oldType) {
        var oldClass = that.getEnumName(oldType).toLowerCase();
        var newClass = that.getEnumName(type).toLowerCase();
        that.getCell(row, column)
          .removeClass(oldClass)
          .addClass(newClass);
        return oldType;
      }
      return null;
    },
    /**
     * Change the type of a cell in the map. Checks the result with the server
     *   and updates the fields upon conflict
     * @param {String} row
     * @param {String} column
     * @param {Enum Layout.TYPES|Int} type
     * @param {Function} fn Callback to run on error
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    setTypeAsync: function _setTypeAsync (row, column, type, fn) {
      var oldType = this.setType(row, column, type);
      fn = typeof fn === 'function' ? fn : function _errorCallback (newType) {
        console.warn('[Layout.setTypeAsync] Server conflict:',
                      layout.getEnumName(newType)
        );
      };
      if (oldType) {
        socket.emit('setType', row, column, type, function _rollback (newType) {
          if (newType !== type) {
            layout.setType(row, column, newType);
            fn(newType, oldType, row, column, type);
          }
        });
      }
      return oldType;
    },
    toElement: function _toElement () {
      return this.getComponents().table;
    }
  });

  function bindEvents (that) {
    that.getComponents()
      .table
      .find('.'+that.classes.empty)
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