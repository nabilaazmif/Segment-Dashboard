/*global QUnit*/

sap.ui.define([
	"segmentkpi/model/formatter",
	"segmentkpi/model/SegmentStyle"
], function (formatter, SegmentStyle) {
	"use strict";

	QUnit.module("Formatter");

	QUnit.test("A ratio is shown as a percentage", function (assert) {
		assert.ok(formatter.ratio(0.235).indexOf("23.5") === 0, "0.235 is 23.5 percent");
		assert.strictEqual(formatter.ratio(null), null, "No value stays empty");
	});

	QUnit.test("Percentage points are not multiplied again", function (assert) {
		assert.ok(formatter.percentPoints(23.45).indexOf("23.5") === 0, "23.45 stays 23.5 percent");
	});

	QUnit.test("A positive fluctuation carries a sign", function (assert) {
		assert.strictEqual(formatter.signedRatio(0.1).charAt(0), "+", "Growth is marked with a plus");
		assert.notStrictEqual(formatter.signedRatio(-0.1).charAt(0), "+", "A decline is not marked with a plus");
	});

	QUnit.test("Negative values are an error state", function (assert) {
		assert.strictEqual(formatter.negativeState(-1), "Error", "A negative margin is an error");
		assert.strictEqual(formatter.negativeState(1), "None", "A positive margin is neutral");
		assert.strictEqual(formatter.valueState(1), "Success", "Growth is a success");
		assert.strictEqual(formatter.valueState(null), "None", "No value is neutral");
	});

	QUnit.module("Segment style");

	QUnit.test("Every segment has its own colour", function (assert) {
		var aCodes = Object.keys(SegmentStyle.HUE);
		var aColors = SegmentStyle.paletteFor(aCodes);
		assert.strictEqual(aColors.length, aCodes.length, "One colour per segment");
		assert.strictEqual(SegmentStyle.colorFor("COAL"), SegmentStyle.colorFor("COAL"),
			"The same segment always gets the same colour");
	});

	QUnit.test("An unknown segment still gets a stable colour", function (assert) {
		assert.strictEqual(SegmentStyle.colorFor("NEWSEG"), SegmentStyle.colorFor("NEWSEG"),
			"An unlisted segment keeps one colour");
	});
});
