sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/Core",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/Column",
	"sap/m/ColumnListItem",
	"sap/m/Label",
	"sap/m/Text",
	"sap/m/ObjectNumber",
	"sap/m/HBox",
	"sap/m/VBox",
	"sap/ui/core/Icon",
	"sap/suite/ui/microchart/LineMicroChart",
	"sap/suite/ui/microchart/LineMicroChartLine",
	"sap/suite/ui/microchart/LineMicroChartPoint",
	"sap/viz/ui5/controls/common/feeds/FeedItem",
	"sap/viz/ui5/controls/Popover",
	"sap/viz/ui5/format/ChartFormatter",
	"sap/viz/ui5/api/env/Format",
	"segmentkpi/model/SegmentStyle",
	"segmentkpi/model/formatter",
	"sap/base/Log"
], function (Controller, Core, JSONModel, Filter, FilterOperator, MessageBox, Column, ColumnListItem,
	Label, Text, ObjectNumber, HBox, VBox, Icon, LineMicroChart, LineMicroChartLine, LineMicroChartPoint, FeedItem, Popover, ChartFormatter, Format, SegmentStyle, formatter, Log) {
	"use strict";

	// One card is one consumption view. A card never reads the entity of another card.
	// Every card shows the same data twice: as a chart and as a table, and `view`
	// decides which of the two the card opens with.
	var TIME_CARDS = [
		{ id: "revenue", vizId: "vizRevenue", tableId: "tblRevenue", entity: "SgdRevenue", field: "Revenue", scale: 1e6, view: "chart" },
		{ id: "grossProfit", vizId: "vizGrossProfit", tableId: "tblGrossProfit", entity: "SgdGrossProfit", field: "GrossProfit", scale: 1e6, view: "chart" },
		{ id: "pat", vizId: "vizPat", tableId: "tblPat", entity: "SgdPat", field: "ProfitAfterTax", scale: 1e6, view: "chart" },
		{ id: "forex", vizId: "vizForex", tableId: "tblForex", entity: "SgdForex", field: "ForexGainLoss", scale: 1e3, view: "chart" }
	];

	// Every card opens as a chart; the table is one click away on all of them.
	var MARGIN_CARDS = [
		{ id: "gpm", vizId: "vizGpm", tableId: "tblGpm", entity: "SgdGpm", field: "GrossProfitMarginPct", numerator: "GrossProfit", ratio: true, view: "chart" },
		{ id: "npm", vizId: "vizNpm", tableId: "tblNpm", entity: "SgdNpm", field: "NetProfitMarginPct", numerator: "ProfitAfterTax", ratio: true, view: "chart" }
	];

	function allCards() {
		return TIME_CARDS.concat(MARGIN_CARDS);
	}

	function compareStrings(sLeft, sRight) {
		if (sLeft === sRight) {
			return 0;
		}
		return sLeft < sRight ? -1 : 1;
	}

	function comparePeriods(oLeft, oRight) {
		return compareStrings(oLeft.year, oRight.year) || compareStrings(oLeft.quarter, oRight.quarter);
	}

	function compareSegments(oLeft, oRight) {
		return compareStrings(oLeft.sort, oRight.sort) || compareStrings(oLeft.code, oRight.code);
	}

	var PIE_ENTITY = "SgdRevenuePie";
	var QUARTERS = ["1", "2", "3", "4"];
	// Waiting time before the cards follow a change in the filter bar, in milliseconds.
	var RELOAD_DELAY = 400;
	var DEFAULT_YEARS = 2;

	return Controller.extend("segmentkpi.controller.Main", {

		formatter: formatter,

		/* ====================================================================
		 * Lifecycle
		 * ==================================================================== */

		onInit: function () {
			this._oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
			this._oData = this.getOwnerComponent().getModel();
			this._oVM = new JSONModel(this._initialState());
			this._oVM.setSizeLimit(1000);
			this.getView().setModel(this._oVM, "view");

			// Segment codes per chart, kept so that the palette can be rebuilt
			// when the user switches the theme.
			this._mChartSegments = {};
			this._bPopoversConnected = false;

			Format.numericFormatter(ChartFormatter.getInstance());
			this._setUpCharts();

			Core.attachThemeChanged(this._onThemeChanged, this);

			this._oData.metadataLoaded()
				.then(this._loadPeriods.bind(this))
				.catch(this._onRequestFailed.bind(this));
		},

		onAfterRendering: function () {
			if (this._bPopoversConnected) {
				return;
			}
			this._bPopoversConnected = true;
			// Values are not printed on the chart itself, the popover shows them on click.
			allCards().forEach(function (oCard) {
				var oViz = this.byId(oCard.vizId);
				new Popover({}).connect(oViz.getVizUid());
			}, this);
		},

		onExit: function () {
			if (this._iReloadTimer) {
				clearTimeout(this._iReloadTimer);
			}
			Core.detachThemeChanged(this._onThemeChanged, this);
		},

		/* ====================================================================
		 * Event handlers
		 * ==================================================================== */

		/**
		 * The filter bar has no Go button, the cards follow the selection. Picking
		 * several values fires this handler several times, so the reload is delayed
		 * a little and the six requests are sent once instead of once per value.
		 */
		onFilterChange: function () {
			if (this._iReloadTimer) {
				clearTimeout(this._iReloadTimer);
			}
			// eslint-disable-next-line @sap-ux/fiori-tools/sap-timeout-usage -- debounce, not a wait for a result
			this._iReloadTimer = setTimeout(function () {
				this._iReloadTimer = null;
				this._loadMain();
			}.bind(this), RELOAD_DELAY);
		},

		/**
		 * Clear in the filter bar. An empty filter is every period, so the cards are
		 * reloaded rather than emptied.
		 */
		onClear: function () {
			this._oVM.setProperty("/selectedYears", []);
			this._oVM.setProperty("/selectedQuarters", []);
			this.onFilterChange();
		},

		/**
		 * The comparison card reloads straight away, it is only two small requests.
		 */
		onPieFilterChange: function () {
			this._loadPie();
		},

		/* ====================================================================
		 * Start up
		 * ==================================================================== */

		_initialState: function () {
			var oState = {
				busy: true,
				years: [],
				quarters: QUARTERS.map(function (sQuarter) {
					return { key: sQuarter, text: this._oBundle.getText("quarterItem", [sQuarter]) };
				}, this),
				selectedYears: [],
				selectedQuarters: [],
				status: { visible: false, type: "Information", text: "" },
				cards: {},
				pie: {
					baseYear: "", baseQuarter: "", mainYear: "", mainQuarter: "",
					baseLabel: "", mainLabel: "", view: "chart",
					baseRows: [], mainRows: [], rows: [],
					message: "", messageVisible: false, chartsVisible: false
				}
			};
			allCards().forEach(function (oCard) {
				oState.cards[oCard.id] = {
					rows: [], chartRows: [], view: oCard.view
				};
			});
			return oState;
		},

		/**
		 * Reads the periods that carry data and derives the filter defaults from them.
		 * @returns {Promise} Resolved once the first set of cards is loaded
		 */
		_loadPeriods: function () {
			return this._read(TIME_CARDS[0].entity, null, "FiscalYear,FiscalQuarter").then(function (aData) {
				this._aDataPeriods = this._distinctPeriods(aData);
				var aYears = this._distinctYears(this._aDataPeriods);

				this._oVM.setProperty("/years", aYears.map(function (sYear) {
					return { key: sYear, text: sYear };
				}));

				if (!this._aDataPeriods.length) {
					this._setStatus("Information", this._oBundle.getText("msgNoDataAtAll"));
					this._oVM.setProperty("/busy", false);
					return undefined;
				}

				this._oVM.setProperty("/selectedYears", aYears.slice(-DEFAULT_YEARS));
				this._oVM.setProperty("/selectedQuarters", QUARTERS.slice());
				this._setUpPieDefaults();

				return Promise.all([this._loadMain(), this._loadPie()]);
			}.bind(this)).catch(this._onRequestFailed.bind(this));
		},

		/**
		 * Main period is the last period that carries data, the comparison period is
		 * the same quarter one year earlier when that quarter has data.
		 */
		_setUpPieDefaults: function () {
			var aPeriods = this._aDataPeriods;
			if (!aPeriods.length) {
				return;
			}

			var iMain = aPeriods.length - 1;
			var oMain = aPeriods[iMain];
			var sPreviousYear = String(parseInt(oMain.year, 10) - 1);
			var oBase = this._findPeriod(sPreviousYear, oMain.quarter) || aPeriods[Math.max(iMain - 1, 0)];

			this._oVM.setProperty("/pie/mainYear", oMain.year);
			this._oVM.setProperty("/pie/mainQuarter", oMain.quarter);
			this._oVM.setProperty("/pie/baseYear", oBase.year);
			this._oVM.setProperty("/pie/baseQuarter", oBase.quarter);
		},

		/* ====================================================================
		 * Global filter, six cards
		 * ==================================================================== */

		_loadMain: function () {
			// An empty filter means every value of that field, not nothing. Clearing
			// the years therefore shows all years that carry data.
			var aYears = this._oVM.getProperty("/selectedYears") || [];
			var aQuarters = this._oVM.getProperty("/selectedQuarters") || [];

			if (!aYears.length) {
				aYears = (this._oVM.getProperty("/years") || []).map(function (oYear) {
					return oYear.key;
				});
			}
			if (!aQuarters.length) {
				aQuarters = QUARTERS.slice();
			}

			if (!aYears.length) {
				// There is no year at all, so the table behind the service is still empty.
				this._clearCards();
				this._setStatus("Information", this._oBundle.getText("msgNoDataAtAll"));
				return Promise.resolve();
			}

			this._oVM.setProperty("/busy", true);

			var oFilter = this._periodFilter(aYears, aQuarters);
			var aCards = allCards();
			var aReads = aCards.map(function (oCard) {
				return this._read(oCard.entity, oFilter);
			}, this);

			return Promise.all(aReads).then(function (aCardData) {
				var aCurrencies = this._distinctCurrencies(aCardData);
				if (aCurrencies.length > 1) {
					this._clearCards();
					this._setStatus("Error", this._oBundle.getText("msgMultiCurrency", [aCurrencies.join(", ")]));
					this._oVM.setProperty("/busy", false);
					return;
				}

				aCards.forEach(function (oCard, i) {
					this._renderCard(oCard, aCardData[i]);
				}, this);

				var bEmpty = aCardData.every(function (aRows) {
					return !aRows.length;
				});
				this._setStatus(bEmpty ? "Information" : null,
					bEmpty ? this._oBundle.getText("msgNoData") : "");
				this._oVM.setProperty("/busy", false);
			}.bind(this)).catch(this._onRequestFailed.bind(this));
		},

		/**
		 * Builds both views of one card from one result set: the chart and the table.
		 * @param {object} oCard Entry of TIME_CARDS or MARGIN_CARDS
		 * @param {object[]} aData Rows of that card's entity
		 */
		_renderCard: function (oCard, aData) {
			var aSegments = this._distinctSegments(aData);
			var aPeriods = this._distinctPeriods(aData);
			var sNotAvailable = this._oBundle.getText("notAvailable");
			var bRatio = !!oCard.ratio;
			var mRows = {};

			aData.forEach(function (oRow) {
				mRows[this._key(oRow.Segment, oRow.FiscalYear, oRow.FiscalQuarter)] = oRow;
			}, this);

			var valueOf = function (oSegment, oPeriod) {
				var oRow = mRows[this._key(oSegment.code, oPeriod.year, oPeriod.quarter)];
				var fValue = oRow ? this._num(oRow[oCard.field]) : null;
				if (fValue === null) {
					return null;
				}
				// A ratio without revenue behind it has no meaning, it is not a zero.
				return (bRatio && !this._num(oRow.Revenue)) ? null : fValue;
			}.bind(this);

			// Amounts are scaled to the unit in the card subtitle, ratios stay in
			// percentage points.
			var display = function (fValue) {
				return bRatio ? fValue : fValue / oCard.scale;
			};
			var format = bRatio ? formatter.percentPoints : formatter.amount;

			var aRows = aSegments.map(function (oSegment) {
				var aPoints = [];
				var aCells = aPeriods.map(function (oPeriod, i) {
					var fValue = valueOf(oSegment, oPeriod);
					if (fValue === null) {
						return { number: sNotAvailable, state: "None" };
					}
					// A period without a value leaves a gap instead of a point at zero.
					aPoints.push({ x: i, y: display(fValue) });
					return {
						number: format(display(fValue)),
						state: formatter.negativeState(fValue)
					};
				});
				return {
					Segment: oSegment.code,
					Color: SegmentStyle.colorFor(oSegment.code),
					SegmentText: oSegment.text,
					cells: aCells,
					points: aPoints
				};
			});

			// One scale for every segment, so that a flat line high up and a flat line
			// near zero do not look the same.
			var aAll = aRows.reduce(function (aValues, oRow) {
				return aValues.concat(oRow.points.map(function (oPoint) {
					return oPoint.y;
				}));
			}, []);
			var fMin = aAll.length ? Math.min.apply(null, aAll) : 0;
			var fMax = aAll.length ? Math.max.apply(null, aAll) : 1;
			if (fMin === fMax) {
				fMin -= 1;
				fMax += 1;
			}
			aRows.forEach(function (oRow) {
				oRow.chartMin = fMin;
				oRow.chartMax = fMax;
			});

			// Full cross product of period and segment for the chart. A combination
			// without data keeps the value null, so the line breaks and no column is
			// drawn. A ratio becomes a fraction, so the value axis can show percent.
			var chartValue = function (fValue) {
				if (fValue === null) {
					return null;
				}
				return bRatio ? fValue / 100 : fValue / oCard.scale;
			};
			var aChartRows = [];
			aPeriods.forEach(function (oPeriod) {
				var sQuarter = this._oBundle.getText("quarterItem", [oPeriod.quarter]);
				aSegments.forEach(function (oSegment) {
					aChartRows.push({
						Year: oPeriod.year,
						Quarter: sQuarter,
						Segment: oSegment.text,
						Value: chartValue(valueOf(oSegment, oPeriod))
					});
				});
			}, this);

			this._oVM.setProperty("/cards/" + oCard.id + "/rows", aRows);
			this._oVM.setProperty("/cards/" + oCard.id + "/chartRows", aChartRows);
			this._applyPalette(oCard.vizId, aSegments);
			this._buildCardTable(oCard, aPeriods);
		},


		/**
		 * The number of columns follows the selected periods, so the table is rebuilt
		 * on every load.
		 * @param {object} oCard Entry of MARGIN_CARDS
		 * @param {object[]} aPeriods Periods of that card, already sorted
		 */
		_buildCardTable: function (oCard, aPeriods) {
			var oTable = this.byId(oCard.tableId);

			oTable.unbindItems();
			oTable.destroyColumns();

			// A fixed width for the names keeps the period columns inside the card,
			// however many periods the user selects.
			oTable.addColumn(new Column({
				width: "8rem",
				header: new Label({ text: this._oBundle.getText("colSegment") })
			}));
			aPeriods.forEach(function (oPeriod) {
				oTable.addColumn(new Column({
					hAlign: "End",
					minScreenWidth: "Tablet",
					demandPopin: true,
					popinDisplay: "Inline",
					// Year above quarter, so that a column stays readable even when the
					// card is only a third of the screen wide.
					header: new VBox({
						alignItems: "End",
						items: [
							new Text({ text: oPeriod.year }),
							new Label({ text: this._oBundle.getText("quarterItem", [oPeriod.quarter]) })
						]
					})
				}));
			}, this);

			// Name, colour and the trend of that one segment. Six lines in a single
			// chart cross each other all the time, one small line per row does not.
			var aCells = [new VBox({
				items: [
					new HBox({
						alignItems: "Center",
						items: [
							new Icon({
								src: "sap-icon://circle-task-2",
								size: "0.75rem",
								color: "{view>Color}"
							}).addStyleClass("sapUiTinyMarginEnd"),
							new Text({ text: "{view>SegmentText}" })
						]
					}),
					new LineMicroChart({
						width: "100%",
						height: "1.5rem",
						showPoints: false,
						showThresholdLine: false,
						minYValue: "{view>chartMin}",
						maxYValue: "{view>chartMax}",
						visible: "{= ${view>points}.length > 1 }",
						lines: [
							new LineMicroChartLine({
								color: "{view>Color}",
								points: {
									path: "view>points",
									template: new LineMicroChartPoint({ x: "{view>x}", y: "{view>y}" })
								}
							})
						]
					})
				]
			})];
			aPeriods.forEach(function (oPeriod, i) {
				aCells.push(new ObjectNumber({
					number: "{view>cells/" + i + "/number}",
					state: "{view>cells/" + i + "/state}",
					emphasized: false
				}));
			});

			oTable.bindItems({
				path: "view>/cards/" + oCard.id + "/rows",
				template: new ColumnListItem({ cells: aCells })
			});
		},

		/* ====================================================================
		 * Comparison card, own filter
		 * ==================================================================== */

		_loadPie: function () {
			var oPie = this._oVM.getProperty("/pie");
			var sBaseYear = oPie.baseYear;
			var sBaseQuarter = oPie.baseQuarter;
			var sMainYear = oPie.mainYear;
			var sMainQuarter = oPie.mainQuarter;

			if (!sBaseYear || !sBaseQuarter || !sMainYear || !sMainQuarter) {
				return Promise.resolve();
			}
			if (sBaseYear === sMainYear && sBaseQuarter === sMainQuarter) {
				// Two identical periods would compare a quarter with itself.
				this._clearPie();
				this._setPieMessage([this._oBundle.getText("msgPieSamePeriod")]);
				return Promise.resolve();
			}

			return Promise.all([
				this._read(PIE_ENTITY, this._periodFilter([sBaseYear], [sBaseQuarter])),
				this._read(PIE_ENTITY, this._periodFilter([sMainYear], [sMainQuarter]))
			]).then(function (aResults) {
				this._renderPie(
					{ year: sBaseYear, quarter: sBaseQuarter }, aResults[0],
					{ year: sMainYear, quarter: sMainQuarter }, aResults[1]
				);
			}.bind(this)).catch(this._onRequestFailed.bind(this));
		},

		_renderPie: function (oBasePeriod, aBaseData, oMainPeriod, aMainData) {
			var sNotAvailable = this._oBundle.getText("notAvailable");
			var aMessages = [];

			var aCurrencies = this._distinctCurrencies([aBaseData, aMainData]);
			if (aCurrencies.length > 1) {
				this._clearPie();
				this._setPieMessage([this._oBundle.getText("msgMultiCurrency", [aCurrencies.join(", ")])]);
				return;
			}

			var sBaseLabel = this._periodLabel(oBasePeriod);
			var sMainLabel = this._periodLabel(oMainPeriod);
			this._oVM.setProperty("/pie/baseLabel", sBaseLabel);
			this._oVM.setProperty("/pie/mainLabel", sMainLabel);

			if (!aBaseData.length && !aMainData.length) {
				aMessages.push(this._oBundle.getText("msgPieNoDataBoth"));
			} else if (!aBaseData.length) {
				aMessages.push(this._oBundle.getText("msgPieNoData", [sBaseLabel]));
			} else if (!aMainData.length) {
				aMessages.push(this._oBundle.getText("msgPieNoData", [sMainLabel]));
			}

			var mBase = this._valuesBySegment(aBaseData);
			var mMain = this._valuesBySegment(aMainData);
			var fBaseTotal = this._total(mBase);
			var fMainTotal = this._total(mMain);
			var aSegments = this._distinctSegments(aBaseData.concat(aMainData));

			var aRows = aSegments.map(function (oSegment) {
				var fBase = mBase.hasOwnProperty(oSegment.code) ? mBase[oSegment.code] : null;
				var fMain = mMain.hasOwnProperty(oSegment.code) ? mMain[oSegment.code] : null;
				// Fluctuation is the growth of the revenue, not the difference in share.
				var fFluc = (fBase === null || fBase === 0 || fMain === null)
					? null
					: (fMain - fBase) / Math.abs(fBase);
				return {
					Segment: oSegment.code,
					Color: SegmentStyle.colorFor(oSegment.code),
					SegmentText: oSegment.text,
					BaseShareText: (fBase === null || !fBaseTotal)
						? sNotAvailable : formatter.ratio(fBase / fBaseTotal),
					MainShareText: (fMain === null || !fMainTotal)
						? sNotAvailable : formatter.ratio(fMain / fMainTotal),
					FlucText: fFluc === null ? sNotAvailable : formatter.signedRatio(fFluc),
					FlucState: formatter.valueState(fFluc)
				};
			});

			var aBaseRows = this._donutRows(aSegments, mBase);
			var aMainRows = this._donutRows(aSegments, mMain);

			this._oVM.setProperty("/pie/rows", aRows);
			this._oVM.setProperty("/pie/baseRows", aBaseRows.rows);
			this._oVM.setProperty("/pie/mainRows", aMainRows.rows);
			this._oVM.setProperty("/pie/chartsVisible", !!(aBaseRows.rows.length || aMainRows.rows.length));
			this._applyPalette("vizPieBase", aBaseRows.segments);
			this._applyPalette("vizPieMain", aMainRows.segments);
			this._setPieMessage(aMessages);
		},

		_donutRows: function (aSegments, mValues) {
			var aRows = [];
			var aUsed = [];
			aSegments.forEach(function (oSegment) {
				var fValue = mValues.hasOwnProperty(oSegment.code) ? mValues[oSegment.code] : null;
				if (fValue === null || fValue <= 0) {
					return;
				}
				aRows.push({ Segment: oSegment.text, Value: fValue });
				aUsed.push(oSegment);
			});
			return { rows: aRows, segments: aUsed };
		},

		_valuesBySegment: function (aData) {
			var mValues = {};
			aData.forEach(function (oRow) {
				mValues[oRow.Segment] = this._num(oRow.Revenue);
			}, this);
			return mValues;
		},

		_total: function (mValues) {
			return Object.keys(mValues).reduce(function (fSum, sKey) {
				return fSum + (mValues[sKey] || 0);
			}, 0);
		},

		_clearPie: function () {
			this._oVM.setProperty("/pie/rows", []);
			this._oVM.setProperty("/pie/baseRows", []);
			this._oVM.setProperty("/pie/mainRows", []);
			this._oVM.setProperty("/pie/chartsVisible", false);
		},

		_setPieMessage: function (aMessages) {
			var sText = (aMessages || []).filter(Boolean).join(" ");
			this._oVM.setProperty("/pie/message", sText);
			this._oVM.setProperty("/pie/messageVisible", !!sText);
		},

		/* ====================================================================
		 * Charts
		 * ==================================================================== */

		/**
		 * Feeds and chart properties. The names of the dimensions come from the
		 * resource bundle, the same keys are used in the view.
		 */
		_setUpCharts: function () {
			var sYear = this._oBundle.getText("dimYear");
			var sQuarter = this._oBundle.getText("dimQuarter");
			var sSegment = this._oBundle.getText("dimSegment");
			var sValue = this._oBundle.getText("measValue");
			var sRevenue = this._oBundle.getText("measRevenue");

			TIME_CARDS.forEach(function (oCard) {
				var oViz = this.byId(oCard.vizId);
				oViz.removeAllFeeds();
				oViz.addFeed(new FeedItem({ uid: "valueAxis", type: "Measure", values: [sValue] }));
				oViz.addFeed(new FeedItem({ uid: "categoryAxis", type: "Dimension", values: [sYear, sQuarter] }));
				oViz.addFeed(new FeedItem({ uid: "color", type: "Dimension", values: [sSegment] }));
				oViz.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					// Six segment names do not fit under a card that is a third of the screen,
					// so the legend is a list beside the plot.
					legendGroup: { layout: { position: "right" } },
					categoryAxis: { title: { visible: false } },
					valueAxis: { title: { visible: false }, label: { formatString: "#,##0.0" } },
					plotArea: {
						// Six segments over several quarters are far too many labels.
						dataLabel: { visible: false },
						// Every selected period has to be visible, the chart must not scroll.
						window: { start: null, end: null }
					},
					tooltip: { visible: true }
				});
			}, this);

			// The ratio charts replace their table while they are open, so they carry
			// their own legend.
			MARGIN_CARDS.forEach(function (oCard) {
				var oViz = this.byId(oCard.vizId);
				oViz.removeAllFeeds();
				oViz.addFeed(new FeedItem({ uid: "valueAxis", type: "Measure", values: [sValue] }));
				oViz.addFeed(new FeedItem({ uid: "categoryAxis", type: "Dimension", values: [sYear, sQuarter] }));
				oViz.addFeed(new FeedItem({ uid: "color", type: "Dimension", values: [sSegment] }));
				oViz.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					legendGroup: { layout: { position: "right" } },
					categoryAxis: { title: { visible: false } },
					valueAxis: { title: { visible: false }, label: { formatString: "0%" } },
					plotArea: {
						dataLabel: { visible: false },
						window: { start: null, end: null }
					},
					tooltip: { visible: true }
				});
			}, this);

			["vizPieBase", "vizPieMain"].forEach(function (sVizId) {
				var oViz = this.byId(sVizId);
				oViz.removeAllFeeds();
				oViz.addFeed(new FeedItem({ uid: "size", type: "Measure", values: [sRevenue] }));
				oViz.addFeed(new FeedItem({ uid: "color", type: "Dimension", values: [sSegment] }));
				oViz.setVizProperties({
					title: { visible: false },
					// The table below the donuts is the legend and shows the figures.
					legend: { visible: false },
					plotArea: { dataLabel: { visible: true, type: "percentage" } },
					tooltip: { visible: true }
				});
			}, this);
		},

		/**
		 * The palette is ordered like the segments in the data of that chart, so that
		 * every segment keeps its own colour.
		 * @param {string} sVizId Id of the chart
		 * @param {object[]} aSegments Segments in the order of the data
		 */
		_applyPalette: function (sVizId, aSegments) {
			this._mChartSegments[sVizId] = aSegments;
			this.byId(sVizId).setVizProperties({
				plotArea: {
					colorPalette: SegmentStyle.paletteFor(aSegments.map(function (oSegment) {
						return oSegment.code;
					}))
				}
			});
		},

		_onThemeChanged: function () {
			Object.keys(this._mChartSegments).forEach(function (sVizId) {
				this._applyPalette(sVizId, this._mChartSegments[sVizId]);
			}, this);
			// The colour in front of every table row comes from the same palette, so it
			// has to follow the theme as well.
			var aPaths = MARGIN_CARDS.map(function (oCard) {
				return "/cards/" + oCard.id + "/rows";
			}).concat("/pie/rows");
			aPaths.forEach(function (sPath) {
				(this._oVM.getProperty(sPath) || []).forEach(function (oRow) {
					oRow.Color = SegmentStyle.colorFor(oRow.Segment);
				});
			}, this);
			this._oVM.refresh(true);
		},

		_clearCards: function () {
			allCards().forEach(function (oCard) {
				this._oVM.setProperty("/cards/" + oCard.id + "/rows", []);
				this._oVM.setProperty("/cards/" + oCard.id + "/chartRows", []);
				this._buildCardTable(oCard, []);
			}, this);
			this._oVM.setProperty("/busy", false);
		},

		/* ====================================================================
		 * Reading
		 * ==================================================================== */

		/**
		 * @param {string} sEntity Name of the entity set
		 * @param {sap.ui.model.Filter} [oFilter] Period filter
		 * @param {string} [sSelect] Value of $select
		 * @returns {Promise<object[]>} The rows
		 */
		_read: function (sEntity, oFilter, sSelect) {
			return new Promise(function (resolve, reject) {
				var mParameters = {
					success: function (oResponse) {
						resolve(oResponse && oResponse.results ? oResponse.results : []);
					},
					error: reject
				};
				if (oFilter) {
					mParameters.filters = [oFilter];
				}
				if (sSelect) {
					mParameters.urlParameters = { "$select": sSelect };
				}
				this._oData.read("/" + sEntity, mParameters);
			}.bind(this));
		},

		/**
		 * Year and quarter are combined as a cross product, the same way a slicer works.
		 * @param {string[]} aYears Selected years
		 * @param {string[]} aQuarters Selected quarters
		 * @returns {sap.ui.model.Filter} The filter
		 */
		_periodFilter: function (aYears, aQuarters) {
			var oYears = new Filter({
				filters: this._unique(aYears).map(function (sYear) {
					return new Filter("FiscalYear", FilterOperator.EQ, sYear);
				}),
				and: false
			});
			var oQuarters = new Filter({
				filters: this._unique(aQuarters).map(function (sQuarter) {
					return new Filter("FiscalQuarter", FilterOperator.EQ, sQuarter);
				}),
				and: false
			});
			return new Filter({ filters: [oYears, oQuarters], and: true });
		},

		_onRequestFailed: function (oError) {
			Log.error("Could not load the segment data", oError, "segmentkpi.controller.Main");
			this._oVM.setProperty("/busy", false);
			MessageBox.error(this._oBundle.getText("msgRequestFailed"), {
				title: this._oBundle.getText("msgRequestFailedTitle")
			});
		},

		/* ====================================================================
		 * Helpers
		 * ==================================================================== */

		_key: function (sSegment, sYear, sQuarter) {
			return sSegment + "|" + sYear + "|" + sQuarter;
		},

		_num: function (vValue) {
			if (vValue === null || vValue === undefined || vValue === "") {
				return null;
			}
			var fValue = parseFloat(vValue);
			return isNaN(fValue) ? null : fValue;
		},

		_unique: function (aValues) {
			return aValues.filter(function (vValue, i) {
				return aValues.indexOf(vValue) === i;
			});
		},

		_distinctPeriods: function (aData) {
			var mSeen = {};
			var aPeriods = [];
			aData.forEach(function (oRow) {
				var sKey = oRow.FiscalYear + "|" + oRow.FiscalQuarter;
				if (!mSeen[sKey]) {
					mSeen[sKey] = true;
					aPeriods.push({ year: oRow.FiscalYear, quarter: oRow.FiscalQuarter });
				}
			});
			return aPeriods.sort(comparePeriods);
		},

		_distinctYears: function (aPeriods) {
			return this._unique(aPeriods.map(function (oPeriod) {
				return oPeriod.year;
			})).sort();
		},

		/**
		 * @param {object[]} aData Rows of one entity
		 * @returns {object[]} Segments sorted by SegmentSortOrder
		 */
		_distinctSegments: function (aData) {
			var mSeen = {};
			var aSegments = [];
			aData.forEach(function (oRow) {
				if (mSeen[oRow.Segment]) {
					return;
				}
				mSeen[oRow.Segment] = true;
				aSegments.push({
					code: oRow.Segment,
					text: oRow.SegmentText || oRow.Segment,
					sort: oRow.SegmentSortOrder || ""
				});
			});
			return aSegments.sort(compareSegments);
		},

		_distinctCurrencies: function (aResults) {
			var aCurrencies = [];
			aResults.forEach(function (aRows) {
				aRows.forEach(function (oRow) {
					if (oRow.Currency && aCurrencies.indexOf(oRow.Currency) === -1) {
						aCurrencies.push(oRow.Currency);
					}
				});
			});
			return aCurrencies;
		},

		_findPeriod: function (sYear, sQuarter) {
			var aFound = (this._aDataPeriods || []).filter(function (oPeriod) {
				return oPeriod.year === sYear && oPeriod.quarter === sQuarter;
			});
			return aFound.length ? aFound[0] : null;
		},

		_periodLabel: function (oPeriod) {
			return this._oBundle.getText("periodLabel", [oPeriod.quarter, oPeriod.year]);
		},

		_setStatus: function (sType, sText) {
			this._oVM.setProperty("/status/type", sType || "Information");
			this._oVM.setProperty("/status/text", sText || "");
			this._oVM.setProperty("/status/visible", !!sText);
		}
	});
});
