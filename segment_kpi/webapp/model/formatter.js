sap.ui.define([
	"sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
	"use strict";

	/**
	 * All formats follow the language of the user in the launchpad, they are never
	 * forced to a single locale.
	 */
	function percentFormat() {
		return NumberFormat.getPercentInstance({ maxFractionDigits: 1 });
	}

	function floatFormat() {
		return NumberFormat.getFloatInstance({ minFractionDigits: 1, maxFractionDigits: 1 });
	}

	return {

		/**
		 * Formats a ratio such as 0.235 as "23.5%".
		 * @param {float|null} fRatio The ratio
		 * @returns {string|null} The formatted percentage or null
		 */
		ratio: function (fRatio) {
			if (fRatio === null || fRatio === undefined || !isFinite(fRatio)) {
				return null;
			}
			return percentFormat().format(fRatio);
		},

		/**
		 * Formats percentage points such as 23.45 as "23.5%".
		 * @param {float|null} fPercent The value in percentage points
		 * @returns {string|null} The formatted percentage or null
		 */
		percentPoints: function (fPercent) {
			if (fPercent === null || fPercent === undefined || !isFinite(fPercent)) {
				return null;
			}
			return percentFormat().format(fPercent / 100);
		},

		/**
		 * Formats a ratio with an explicit sign, so that the direction of a change is
		 * readable without relying on colour.
		 * @param {float|null} fRatio The ratio
		 * @returns {string|null} The formatted percentage or null
		 */
		signedRatio: function (fRatio) {
			if (fRatio === null || fRatio === undefined || !isFinite(fRatio)) {
				return null;
			}
			var sValue = percentFormat().format(fRatio);
			return fRatio > 0 ? "+" + sValue : sValue;
		},

		/**
		 * Formats an already scaled amount with one decimal.
		 * @param {float|null} fValue The scaled amount
		 * @returns {string|null} The formatted amount or null
		 */
		amount: function (fValue) {
			if (fValue === null || fValue === undefined || !isFinite(fValue)) {
				return null;
			}
			return floatFormat().format(fValue);
		},

		/**
		 * State of a value, used for the colour of an ObjectNumber and ObjectStatus.
		 * @param {float|null} fValue The value
		 * @returns {string} A sap.ui.core.ValueState
		 */
		valueState: function (fValue) {
			if (fValue === null || fValue === undefined || !isFinite(fValue) || fValue === 0) {
				return "None";
			}
			return fValue < 0 ? "Error" : "Success";
		},

		/**
		 * State of a ratio that is only an alert when it is negative.
		 * @param {float|null} fValue The value
		 * @returns {string} A sap.ui.core.ValueState
		 */
		negativeState: function (fValue) {
			if (fValue === null || fValue === undefined || !isFinite(fValue) || fValue >= 0) {
				return "None";
			}
			return "Error";
		}
	};
});
