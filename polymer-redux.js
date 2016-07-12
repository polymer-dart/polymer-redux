(function(root, factory) {
    /* istanbul ignore next */
    if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root['PolymerRedux'] = factory();
    }
})(this, function() {
    var warning = 'Polymer Redux: <%s>.%s has "notify" enabled, two-way bindings goes against Redux\'s paradigm';

    /**
     * Factory function for creating a listener for a give Polymer element. The
     * returning listener should be passed to `store.subscribe`.
     *
     * @param {HTMLElement} element Polymer element.
     * @return {Function} Redux subcribe listener.
     */
    function createListener(element, store) {
        var props = [];

        // property bindings
        if (element.properties != null) {
            Object.keys(element.properties).forEach(function(name) {
                var prop = element.properties[name];
                if (prop.hasOwnProperty('statePath')) {
                    // notify flag, warn against two-way bindings
                    if (prop.notify && !prop.readOnly) {
                        console.warn(warning, element.is, name);
                    }
                    props.push({
                        name: name,
                        // Empty statePath return state
                        path: prop.statePath || store.getState,
                        readOnly: prop.readOnly,
                        type: prop.type
                    });
                }
            });
        }

        // redux listener
        return function() {
            var state = store.getState();
            props.forEach(function(property) {
                var propName = property.name;
                var splices = [];
                var value, previous, notifications;

                // statePath, a path or function.
                var path = property.path;
                if (typeof path === 'function') {
                    value = path.call(element, state);
                } else {
                    value = Polymer.Base.get(path, state);
                }

                previous = element.get(property.name);
                switch (property.type) {
                    case Object:
                        notifications = objectNotifications(propName, previous, value);
                        break;

                    case Array:
                        try {
                            notifications = arrayNotifications(propName, previous, value);
                        } catch (e) {
                            throw new TypeError(
                                '<'+ element.is +'>.'+ propName +' type is Array but given: ' + (typeof value)
                            );
                        }
                        break;

                    default:
                        notifications = valueNotifications(propName, previous, value);
                        break;
                }

                // apply all element notifications
                notifications.forEach(function(notif) {
                    var type = notif.type;

                    // readOnly props
                    if (property.readOnly && type === 'set') type = 'notifyPath';

                    element[type].apply(element, notif.args);
                });
            });
            element.fire('state-changed', state);
        }
    }

    /**
     * Creates Element notification call for a given path by comparing the property
     * (previous) value and the state (value) value.
     *
     * @param {String} path Element property path.
     * @param {*} previous The Element property value.
     * @param {*} value The store's state value.
     * @return {Array} Notification calls.
     */
    function valueNotifications(path, previous, value) {
        var notifications = [];
        if (previous !== value) {
            notifications.push({
                type: 'set',
                args: [path, value]
            });
        }
        return notifications;
    }

    /**
     * Creates Element notification calls for array splices for a given path by
     * comparing the property (previous) value and the state (value) value.
     *
     * @param {String} path Element property path.
     * @param {Array} previous The Element property array.
     * @param {Array} value The store's state array.
     * @return {Array} Notification calls.
     */
    function arrayNotifications(path, previous, value) {
        var notifications = [];
        var useSet = !previous;
        var splices, splice, added;

        previous = previous || /* istanbul ignore next */ [];
        value = value || /* istanbul ignore next */ [];

        // check the value type
        if (!Array.isArray(value)) {
            throw new TypeError(); // caught by listener
        }

        // we have no previous array, use set
        if (useSet) {
            notifications.push({
                type: 'set',
                args: [path, value]
            });
        } else {
            // calculate the splices
            splices = Polymer.ArraySplice.calculateSplices(value, previous);
            for (var i = 0, l = splices.length; i < l; ++i) {
                splice = splices[i];
                added = [];

                // splice additions
                if (splice.addedCount) {
                    added = value.slice(splice.index, splice.index + splice.addedCount);
                }

                notifications.push({
                    type: 'splice',
                    args: [path, splice.index, splice.removed.length].concat(added)
                });
            }
        }

        return notifications;
    }

    /**
     * Creates Element notification calls for deep objects. Recursively iterating
     * over each property and checking the property (previous) value and the store's
     * state (value) value.
     *
     * @param {String} path Element property path.
     * @param {Array} previous The Element property array.
     * @param {Array} value The store's state array.
     * @return {Array} Notification calls.
     */
    function objectNotifications(path, previous, value) {
        var notifications = [];
        var keys, previousValue, currentValue, keyPath, subNotifications;

        value = value || /* istanbul ignore next */ {};

        if (previous == null) return valueNotifications(path, previous, value);

        keys = Object.keys(value);
        for (var i = 0, l = keys.length; i < l; ++i) {
            key = keys[i];
            previousValue = previous[key];
            currentValue = value[key];
            keyPath = [path, key].join('.');

            if (previousValue && previousValue.constructor === Object) {
                subNotifications = objectNotifications(keyPath, previousValue, currentValue);
            } else if (Array.isArray(previousValue)) {
                subNotifications = arrayNotifications(keyPath, previousValue, currentValue);
            } else {
                subNotifications = valueNotifications(keyPath, previousValue, currentValue);
            }

            notifications = notifications.concat(subNotifications);
        }

        return notifications;
    }

    /**
     * Binds an given Polymer element to a Redux store.
     *
     * @param {HTMLElement} element Polymer element.
     * @param {Object} store Redux store.
     */
    function bindReduxListener(element, store) {
        var listener;

        if (element._reduxUnsubscribe) return;

        listener = createListener(element, store);
        listener(); // start bindings

        element._reduxUnsubscribe = store.subscribe(listener);
    }

    /**
     * Unbinds a Polymer element from a Redux store.
     *
     * @param {HTMLElement} element
     */
    function unbindReduxListener(element) {
        if (typeof element._reduxUnsubscribe === 'function') {
            element._reduxUnsubscribe();
            delete element._reduxUnsubscribe;
        }
    }

    /**
     * Dispatches a Redux action via a Polymer element. This gives the element
     * a polymorphic dispatch function. See the readme for the various ways to
     * dispatch.
     *
     * @param {HTMLElement} element Polymer element.
     * @param {Object} store Redux store.
     * @param {Array} args The arguments passed to `element.dispatch`.
     * @return {Object} The computed Redux action.
     */
    function dispatchReduxAction(element, store, args) {
        var action = args[0];
        var actions = element.actions;

        // action name
        if (actions && typeof action === 'string') {
            if (typeof actions[action] !== 'function') {
                throw new TypeError('Polymer Redux: <' + element.is + '> has no action "' + action + '"');
            }
            return store.dispatch(actions[action].apply(element, args.slice(1)));
        }

        // action creator
        if (typeof action === 'function' && action.length === 0) {
            return store.dispatch(action());
        }

        // action
        return store.dispatch(action);
    }

    /**
     * Creates PolymerRedux behaviors from a given Redux store.
     *
     * @param {Object} store Redux store.
     * @return {PolymerRedux}
     */
    return function(store) {
        var PolymerRedux;

        // check for store
        if (!store) {
            throw new TypeError('missing redux store');
        }

        /**
         * `PolymerRedux` binds a given Redux store's state to implementing Elements.
         *
         * Full documentation available, https://github.com/tur-nr/polymer-redux.
         *
         * @polymerBehavior PolymerRedux
         * @demo demo/index.html
         */
        return PolymerRedux = {
            /**
             * Fired when the Redux store state changes.
             * @event state-changed
             * @param {*} state
             */

            ready: function() {
                bindReduxListener(this, store);
            },

            attached: function() {
                bindReduxListener(this, store);
            },

            detached: function() {
                unbindReduxListener(this);
            },

            /**
             * Dispatches an action to the Redux store.
             *
             * @param {String|Object|Function} action
             * @return {Object} The action that was dispatched.
             */
            dispatch: function(action /*, [...args] */) {
                var args = Array.prototype.slice.call(arguments);
                return dispatchReduxAction(this, store, args);
            },

            /**
             * Gets the current state in the Redux store.
             * @return {*}
             */
            getState: function() {
                return store.getState();
            },
        };
    };
});
