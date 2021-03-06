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

/* global CSS */

/**
 * Object that collapses or hides DOM elements and able to roll it back.
 */
var ElementCollapser = (function() {

    var collapserStyleId = "adguard-collapse-styles";
    var hiddenElements = [];

    /**
     * Gets full DOM path to the specified element
     */
    var getDomPath = function (el) {
        var stack = [];
        while (el.parentNode !== null) {
            var sibCount = 0;
            var sibIndex = 0;
            // get sibling indexes
            for (var i = 0; i < el.parentNode.childNodes.length; i++) {
                var sib = el.parentNode.childNodes[i];
                if (sib.nodeName == el.nodeName) {
                    if (sib === el) {
                        sibIndex = sibCount;
                    }
                    sibCount++;
                }
            }

            //https://github.com/AdguardTeam/AdguardBrowserExtension/issues/373
            var nodeName = el.nodeName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '\\$&');
            if (sibCount > 1) {
                stack.unshift(nodeName + ':nth-of-type(' + (sibIndex + 1) + ')');
            } else {
                stack.unshift(nodeName);
            }
            el = el.parentNode;
        }

        //Remove heading html
        if (stack.length > 0 && stack[0] == 'html') {
            stack.splice(0, 1);
        }

        return stack.join(' > ');
    };

    /**
     * Applies CSS stylesheets
     *
     * @param rule css rule
     * @param shadowRoot
     */
    var applyCss = function (rule, shadowRoot) {
        var styleElement = getStyleElement(shadowRoot);
        if (!styleElement) {
            styleElement = document.createElement("style");
            styleElement.id = collapserStyleId;
            styleElement.setAttribute("type", "text/css");

            if (shadowRoot) {
                shadowRoot.appendChild(styleElement);
            } else {
                (document.head || document.documentElement).appendChild(styleElement);
            }
        }

        styleElement.sheet.insertRule(prepareSelector(rule, !!shadowRoot), styleElement.sheet.cssRules.length);
    };

    /**
     * Adds "selectorText { display:none!important; }" style
     *
     * @param selectorText
     * @param cssText optional
     * @param shadowRoot optional
     */
    var hideBySelector = function(selectorText, cssText, shadowRoot) {
        var rule = selectorText + '{' + (cssText || "display: none!important;") + '}';

        applyCss(rule, shadowRoot);
    };

    /**
     * Adds "selectorText { display:none!important; }" style
     *
     * @param shadowRoot optional
     */
    var hideBySelectorAndTagName = function(selectorText, tagName, shadowRoot) {
        if (tagName === "frame" || tagName === "iframe") {
            // Use specific style for frames due to these issues:
            // https://github.com/AdguardTeam/AdguardBrowserExtension/issues/346
            // https://github.com/AdguardTeam/AdguardBrowserExtension/issues/355
            // https://github.com/AdguardTeam/AdguardBrowserExtension/issues/347
            hideBySelector(selectorText, "visibility: hidden!important; height: 0px!important;", shadowRoot);
        } else {
            hideBySelector(selectorText, null, shadowRoot);
        }
    };

    /**
     * Unhides elements which were previously hidden by the specified selector
     */
    var unhideBySelector = function(selectorText, shadowRoot) {
        var styleElement = getStyleElement(shadowRoot);
        if (!styleElement || !styleElement.sheet) {
            return;
        }
        var iLength = styleElement.sheet.cssRules.length;
        while (iLength--) {
            var cssRule = styleElement.sheet.cssRules[iLength];
            if (cssRule.selectorText == prepareSelector(selectorText, !!shadowRoot)) {
                styleElement.sheet.deleteRule(iLength);
            }
        }

        if (styleElement.sheet.cssRules.length === 0) {
            // Schedule empty stylesheet removal
            setTimeout(function() {
                // Double check stylesheet size
                if (styleElement.parentNode && styleElement.sheet && styleElement.sheet.cssRules.length === 0) {
                    styleElement.parentNode.removeChild(styleElement);
                }
            }, 100);
        }
    };

    /**
     * Searches for the specified elements in the hiddenElements collection
     * and returns the first occurence.
     */
    var findHiddenElement = function(element) {
        var iLength = hiddenElements.length;
        while (iLength--) {
            var hiddenElement = hiddenElements[iLength];
            if (hiddenElement.node === element) {
                return hiddenElement;
            }
        }
        return null;
    };

    /**
     * Hides specified element
     *
     * @param shadowRoot optional
     */
    var hideElement = function(element, shadowRoot) {
        var selectorText = getDomPath(element);
        // First check if we have hidden it already
        var hiddenElement = findHiddenElement(element);
        if (hiddenElement && hiddenElement.selectorText === selectorText) {
            // Nothing changed, we should do nothing
            return;
        }

        var tagName = element.tagName.toLowerCase();
        hideBySelectorAndTagName(selectorText, tagName, shadowRoot);

        if (hiddenElement) {
            // Remove redundant selector and save the new one
            unhideBySelector(hiddenElement.selectorText, shadowRoot);
            hiddenElement.selectorText = selectorText;
        } else {
            hiddenElement = {
                node: element,
                selectorText: selectorText
            };
            hiddenElements.push(hiddenElement);
        }
    };

    /**
     * Unhides specified element
     */
    var unhideElement = function(element, shadowRoot) {
        var iLength = hiddenElements.length;
        while (iLength--) {
            var hiddenElement = hiddenElements[iLength];
            if (hiddenElement.node === element) {
                unhideBySelector(hiddenElement.selectorText, shadowRoot);
                hiddenElements.splice(iLength, 1);
            }
        }
    };

    /**
     * Creates selector for specified tagName and src attribute
     */
    var createSelectorForSrcAttr = function(srcAttrValue, tagName) {
        return tagName + '[src="'+ CSS.escape(srcAttrValue) + '"]';
    };

    /**
     * Finds style containing dom element
     *
     * @param shadowRoot
     * @returns {Element} or null
     */
    var getStyleElement = function(shadowRoot) {
        if (shadowRoot) {
            var el = shadowRoot.querySelector('#' + collapserStyleId);
            if (el) {
                return el;
            }
        }

        return document.getElementById(collapserStyleId);
    };

    /**
     * Prepares selector or rule text
     *
     * @param selector
     * @param useShadowDom
     * @returns {*}
     */
    var prepareSelector = function (selector, useShadowDom) {
        return useShadowDom ? '::content ' + selector : selector;
    };

    /**
     * Collapses specified element.
     *
     * @param element Element to collapse
     * @param shadowRoot optional
     */
    var collapseElement = function(element, shadowRoot) {

        var tagName = element.tagName.toLowerCase();
        var source = element.getAttribute('src');
        if (source) {
            //To not to keep track of changing src for elements, we are going to collapse it with a CSS rule
            //https://github.com/AdguardTeam/AdguardBrowserExtension/issues/408
            var srcSelector = createSelectorForSrcAttr(source, tagName);
            hideBySelectorAndTagName(srcSelector, tagName, shadowRoot);

            return;
        }

        var cssProperty = "display";
        var cssValue = "none";
        var cssPriority = "important";

        if (tagName == "frame") {
            cssProperty = "visibility";
            cssValue = "hidden";
        }

        var elementStyle = element.style;
        var elCssValue = elementStyle.getPropertyValue(cssProperty);
        var elCssPriority = elementStyle.getPropertyPriority(cssProperty);

        // <input type="image"> elements try to load their image again
        // when the "display" CSS property is set. So we have to check
        // that it isn't already collapsed to avoid an infinite recursion.
        if (elCssValue != cssValue || elCssPriority != cssPriority) {
            elementStyle.setProperty(cssProperty, cssValue, cssPriority);
        }
    };

    return {
        /**
         * Collapses specified element using inline style
         *
         * @param element Element to collapse
         * @param shadowRoot optional shadow root element
         */
        collapseElement: collapseElement,

        /**
         * Hides specified element
         *
         * @param element Element to hide
         * @param shadowRoot optional shadow root element
         */
        hideElement: hideElement,

        /**
         * Removes the style used to hide the specified element
         *
         * @param element Element to unhide
         * @param shadowRoot optional shadow root element
         */
        unhideElement: unhideElement,

        /**
         * Adds "selectorText { display:none!important; }" style
         *
         * @param selectorText CSS selector
         * @param cssText (optional) Overrides style used for hiding
         * @param shadowRoot optional shadow root element
         */
        hideBySelector: hideBySelector,

        /**
         * Unhides elements which were previously hidden by the specified selector
         *
         * @param selectorText CSS selector
         * @param shadowRoot optional shadow root element
         */
        unhideBySelector: unhideBySelector
    };
})();