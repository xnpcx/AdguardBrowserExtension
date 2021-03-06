/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */
/* global exports, safari, require, antiBannerService */

var Log = require('utils/log').Log;
var SafariContentBlockerConverter = require('converter').SafariContentBlockerConverter;
var EventNotifier = require('utils/notifier').EventNotifier;
var EventNotifierTypes = require('utils/common').EventNotifierTypes;
var Utils = require('utils/browser-utils').Utils;
var userSettings = require('utils/user-settings').userSettings;
var whiteListService = require('filter/whitelist').whiteListService;

/**
 * Safari Content Blocker helper
 */
exports.SafariContentBlocker = {

    RULES_LIMIT: 50000,

    emptyBlockerUrl: 'config/empty.json',
    emptyBlockerJSON: null,

    /**
     * Load content blocker
     */
    updateContentBlocker: function () {

        this._loadAndConvertRules(this.RULES_LIMIT, function (result) {

            if (!result) {
                this._clearFilters();
                return;
            }

            var json = JSON.parse(result.converted);
            this._setSafariContentBlocker(json);
            EventNotifier.notifyListeners(EventNotifierTypes.CONTENT_BLOCKER_UPDATED, {rulesCount: json.length, rulesOverLimit: result.overLimit});

        }.bind(this));
    },

    /**
     * Disables content blocker
     * @private
     */
    _clearFilters: function () {
        this._setSafariContentBlocker(this._getEmptyBlockerJson());
    },

    /**
     * @returns JSON for empty content blocker
     * @private
     */
    _getEmptyBlockerJson: function () {
        if (!this.emptyBlockerJSON) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", this.emptyBlockerUrl, false);
            xhr.send(null);
            this.emptyBlockerJSON = JSON.parse(xhr.responseText);
        }
        return this.emptyBlockerJSON;
    },

    /**
     * Load rules from requestFilter and WhiteListService and convert for ContentBlocker
     * @private
     */
    _loadAndConvertRules: Utils.debounce(function (rulesLimit, callback) {

        if (userSettings.isFilteringDisabled()) {
            Log.info('Disabling content blocker.');
            callback(null);
            return;
        }

        Log.info('Starting loading content blocker.');

        var rules = antiBannerService.getRequestFilter().getRules();

        if (userSettings.isDefaultWhiteListMode()) {
            rules = rules.concat(whiteListService.getRules());
        } else {
            var invertedWhitelistRule = this._constructInvertedWhitelistRule();
            if (invertedWhitelistRule) {
                rules = rules.concat(invertedWhitelistRule);
            }
        }

        var result = SafariContentBlockerConverter.convertArray(rules, rulesLimit);
        if (result && result.converted) {
            callback(result);
        } else {
            callback(null);
        }

    }, 500),

    _setSafariContentBlocker: function (json) {
        try {
            Log.info('Setting content blocker. Length=' + json.length);
            safari.extension.setContentBlocker(json);
            Log.info('Content blocker has been set.');
        } catch (ex) {
            Log.error('Error while setting content blocker: ' + ex);
        }
    },

    _constructInvertedWhitelistRule: function () {
        var domains = whiteListService.getWhiteList();
        var invertedWhitelistRule = '@@||*$document';
        if (domains && domains.length > 0) {
            invertedWhitelistRule += ",domain=";
            for (var i = 0, len = domains.length; i < len; i++) {
                if (i > 0) {
                    invertedWhitelistRule += '|';
                }

                invertedWhitelistRule += '~' + domains[i];
            }
        }

            return invertedWhitelistRule;
    }
};
