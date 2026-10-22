sap.ui.define([
	"sap/ui/core/theming/Parameters",
	"sap/base/Log"
], function (Parameters, Log) {
	"use strict";

	/**
	 * Qualitative hue of the theme palette per segment code. The colour follows the
	 * segment, not the position in the data, so a segment keeps its colour in every
	 * card and also when the user is only authorised for part of the segments.
	 *
	 * A new segment needs a fixed value in domain ZFI_SGD_SEGMENT and an entry here.
	 * Hue 1 to 8 are available before the colours become hard to tell apart.
	 */
	var HUE = {
		COAL: 1,
		CONSTR: 2,
		CONMACH: 3,
		ENERGY: 4,
		GOLD: 5,
		MINCON: 6
	};

	var MAX_HUE = 8;

	// Used when the theme parameter cannot be read, for example in a unit test
	// without a loaded theme.
	var FALLBACK = [
		"#5899DA", "#E8743B", "#19A979", "#ED4A7B",
		"#945ECF", "#13A4B4", "#525DF4", "#BF399E"
	];

	/**
	 * Reads a theme parameter without failing on the deprecated synchronous signature.
	 * @param {string} sName Name of the theme parameter
	 * @returns {string|undefined} The colour or undefined when it is not available yet
	 */
	function readParameter(sName) {
		var vValue;
		try {
			vValue = Parameters.get({ name: sName });
			if (!vValue) {
				// The synchronous signature is deprecated but still works in older releases.
				vValue = Parameters.get(sName);
			}
		} catch (oError) {
			Log.debug("Theme parameter " + sName + " is not available: " + oError.message,
				null, "segmentkpi.model.SegmentStyle");
			vValue = undefined;
		}
		return typeof vValue === "string" && vValue ? vValue : undefined;
	}

	/**
	 * Stable hue for a segment that is not listed in HUE, so that an unknown code
	 * still keeps the same colour in every card.
	 * @param {string} sSegment Segment code
	 * @returns {int} Hue between 1 and MAX_HUE
	 */
	function fallbackHue(sSegment) {
		var iSum = 0;
		for (var i = 0; i < sSegment.length; i++) {
			iSum += sSegment.charCodeAt(i);
		}
		return (iSum % MAX_HUE) + 1;
	}

	return {

		HUE: HUE,

		/**
		 * Colour of one segment, taken from the qualitative chart palette of the
		 * current theme so that Horizon, Horizon Dark and High Contrast all work.
		 * @param {string} sSegment Segment code
		 * @returns {string} CSS colour
		 */
		colorFor: function (sSegment) {
			var iHue = HUE[sSegment];
			if (!iHue) {
				iHue = fallbackHue(sSegment || "");
				Log.warning("Segment " + sSegment + " has no fixed hue, using hue " + iHue, null, "segmentkpi.model.SegmentStyle");
			}
			return readParameter("sapUiChartPaletteQualitativeHue" + iHue) || FALLBACK[iHue - 1];
		},

		/**
		 * Colour palette for a chart. The order must match the order in which the
		 * segments appear in the data of that chart.
		 * @param {string[]} aSegments Segment codes in the order of the data
		 * @returns {string[]} CSS colours in the same order
		 */
		paletteFor: function (aSegments) {
			return (aSegments || []).map(this.colorFor, this);
		}
	};
});
