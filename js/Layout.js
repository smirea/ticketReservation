var Layout = (function _Layout () {

  return Class.extend({
    options: {
      map: {},
      codeLength: 6,
      codeChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    },
    TYPES: makeEnum('BLANK EMPTY LOCKED RESERVED'),
    init: function Layout (_options) {
      var that = this;

      // extend the default options with the new options
      for (var name in _options) {
        that.options[name] = _options[name];
      }

      var components = {
        that: that,
        map: {},
        maxColumns: 0,
        codes: {}
      };

      that.getComponents =  function _getComponents () {
        return components;
      };

      getPositions(that);
      normalizeMap(that);
      generateCodes(that);
    },
    /**
     * Set the state of the layout to a specific point
     * @param {Object} setup
     */
    loadState: function _loadState (setup) {
      var that = this;
      if (setup.options) {
        for (var key in setup.options) {
          that.options[key] = setup.options[key];
        }
      }
      that.TYPES = setup.TYPES || that.TYPES;
      that.getComponents().codes = setup.codes || that.getComponents().codes;
      if (setup.map) {
        /*
        for (var row in setup.map) {
          for (var column in setup.map[row]) {
            if (setup.map[row][column] === that.TYPES.LOCKED) {
              setup.map[row][column] = that.TYPES.EMPTY;
            }
          }
        }
        */
        that.getComponents().map = setup.map;
      }
    },
    /**
     * Get the seat code. Only makes sense if used on the server
     * @param {String} row
     * @param {String} column
     * @returns {String}
     */
    getCode: function _getCode (row, column) {
      return this.getComponents().codes[row][column];
    },
    /**
     * Changes the type of the field. Shorthand for setType(...)
     * @param {String} row
     * @param {String} column
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    lock: function _lock (row, column) {
      return this.setType(row, column, this.TYPES.LOCKED);
    },
    /**
     * Changes the type of the field only if it is locked.
     *  Shorthand for setType(...)
     * @param {String} row
     * @param {String} column
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    unlock: function _unlock (row, column) {
      if (this.getType(row, column) === this.TYPES.LOCKED) {
        return this.makeEmpty(row, column);
      }
      console.warn('[Layout.unlock] Seat `'+row+'-'+column+'` is not locked!');
      return null;
    },
    /**
     * Changes the type of the field only if it is empty or locked.
     *  Shorthand for setType(...)
     * @param {String} row
     * @param {String} column
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    reserve: function _reserve (row, column) {
      var oldType = this.getType(row, column);
      if (oldType === this.TYPES.EMPTY || oldType === this.TYPES.LOCKED) {
        return this.setType(row, column, this.TYPES.RESERVED);
      }
      var oldTypeName = Object.keys(this.TYPES)[oldType - 1];
      console.warn('[Layout.reserve] Seat `'+row+'-'+column+'` could not be' +
                    ' reserved as it is `'+oldTypeName+'`');
      return null;
    },
    /**
     * Changes the type of the field. Shorthand for setType(...)
     * @param {String} row
     * @param {String} column
     * @returns {Enum Layout.TYPES} The old type on success or NULL on error
     */
    makeEmpty: function _makeEmpty (row, column) {
      return this.setType(row, column, this.TYPES.EMPTY);
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
      var components = that.getComponents();
      var map = components.map;
      if (arguments.length < 3) {
        console.warn('[Layout.setType] Insufficient arguments');
        return null;
      } else if (isNaN(type) || type < 0 || type >= that.TYPES.length){
        console.warn('[Layout.setType] Invalid type "'+type+'"');
        return null;
      } else if (!map[row] || !map[row][column]) {
        console.warn('[Layout.setType] Invalid indexes: ', row, column);
        return null;
      } else {
        if (type === that.TYPES.BLANK) {
          console.warn('[Layout.setType] WARNING: changing type into BLANK');
        }
        if (map[row][column] === that.TYPES.BLANK) {
          console.warn('[Layout.setType] WARNING: changing type from BLANK');
        }
        var oldType = map[row][column];
        map[row][column] = type;
        return oldType;
      }
    },
    /**
     * Returns the type of the row at the given position
     * @param {String} row
     * @param {String} column
     * @returns {Enum Layout.TYPES} Returns null on error
     */
    getType: function _getType (row, column) {
      var that = this;
      var map = that.getComponents().map;
      if (!map[row] || !map[row][column]) {
        console.warn('[Layout.getType] Invalid seat number: ', row, column);
        return null;
      }
      return map[row][column];
    },
    /**
     * Get the name of an enum made with Layout-makeEnum
     * @param {Int} id
     * @param {Enum|Object} enum
     * @returns {String} Returns null if not found
     */
    getEnumName: function _getEnumName (id, customEnum) {
      return Object.keys(customEnum || this.TYPES)[id-1] || null;
    }
  });

  /**
   * Generates the map by getting the verbatim position of every seat
   * @param {Layout} that
   */
  function getPositions(that){
    var components = that.getComponents();
    for(var key in that.options.map) {
      var numbers = that.options.map[key]
                      .split(',')
                      .map(function(r){ return r.split('-'); })
                      .map(applyRange)
                      .reduce(function(a,b){ return a.concat(b); }, []);

      var labels = applyRange(key.split('-'))
                      .reduce(function(a,b){ return a.concat(b); }, []);

      for (var i=0; i<labels.length; ++i) {
        components.map[labels[i]] = {};
        for (var j=0; j<numbers.length; ++j) {
          components.map[labels[i]][numbers[j]] = that.TYPES.EMPTY;
        }
        if( numbers.length > components.maxColumns )
          components.maxColumns = numbers.length;
      }
    }
  }

  /**
   * Generate an unique code for every seat
   *  and store them in components.codes
   */
  function generateCodes (that) {
    var components = that.getComponents();
    components.codes = {};
    var chars = that.options.codeChars.split('');
    var taken = {};
    var getCode = function _getCode () {
      var str = '';
      for (var i=0; i<that.options.codeLength; ++i) {
        str += chars[Math.floor(Math.random() * chars.length)];
      }
      return str;
    };
    for (var row in components.map) {
      components.codes[row] = {};
      for (var column in components.map[row]) {
        if (that.getType(row, column) !== that.TYPES.BLANK) {
          var breakCount = 0;
          var code;
          do {
            code = getCode();
            //TODO: Warning! Risk of infinite loop
          } while (taken[code]);
          taken[code] = true;
          components.codes[row][column] = code;
        }
      }
    }
  }

  /**
   * Considers the map as being a rectangle with components.maxColumns width
   *    fills in all missing keys in map with TYPES.BLANK
   * @param {Layout} that
   */
  function normalizeMap (that){
    var components = that.getComponents();
    for (var key in components.map) {
      for (var i=1; i<components.maxColumns; ++i) {
        components.map[key][i] = components.map[key][i] || that.TYPES.BLANK;
      }
    }
  }

  /**
   * Simplified version of python's range() function
   * @param {Int|Char} start
   * @param {Int|Char} end
   * @returns {Array}
   */
  function range (start, end) {
    var result = [];
    var increment = 1;
    if(typeof start === 'number'){
      if(start > end){
        increment = -1;
      }
      while(start !== end){
        result.push(start);
        start += increment;
      }
    } else {
      if(start.charCodeAt(0) > end.charCodeAt(0)){
        increment = -1;
      }
      while(start !== end){
        result.push(start);
        start = String.fromCharCode(start.charCodeAt(0) + increment);
      }
    }
    result.push(end);
    return result;
  }

  function applyRange (anArray) {
    if(anArray.length == 2){
      if(isNaN(anArray[0]))
        return range(anArray[0], anArray[1]);
      else
        return range(parseInt(anArray[0]), parseInt(anArray[1]));
    }
    return anArray;
  }

  /**
   * Takes a space separated string and return an enum
   * @param {String} str
   * @returns {Object}
   */
  function makeEnum (str) {
    var arr = str.split(' ');
    var result = {};
    for (var i=0; i<arr.length; ++i) {
      result[arr[i]] = i+1;
    }
    return result;
  }

})();

var exports = exports || {};
exports.Layout = Layout;