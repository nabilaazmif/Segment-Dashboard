## Application Details
|               |
| ------------- |
|**Generation Date and Time**<br>Mon Oct 12 2026 16:45:50 GMT+0700 (Western Indonesia Time)|
|**App Generator**<br>SAP Fiori Application Generator|
|**App Generator Version**<br>1.26.0|
|**Generation Platform**<br>Visual Studio Code|
|**Template Used**<br>Basic V2|
|**Service Type**<br>SAP System (ABAP On-Premise)|
|**Service URL**<br>http://ares-ap-dev.admo.astra.co.id:8080/sap/opu/odata/sap/ZUI_SB_SGD_DASH|
|**Module Name**<br>segment_kpi|
|**Application Title**<br>Segment Dashboard|
|**Namespace**<br>|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.108.9|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>True, see https://www.npmjs.com/package/@sap-ux/eslint-plugin-fiori-tools#rules for the eslint rules.|

## segment_kpi

An SAP Fiori application.

### Starting the generated app

-   This app has been generated using the SAP Fiori tools - App Generator, as part of the SAP Fiori tools suite.  To launch the generated application, run the following from the generated application root folder:

```
    npm start
```

- It is also possible to run the application using mock data that reflects the OData Service URL supplied during application generation.  In order to run the application with Mock Data, run the following from the generated app root folder:

```
    npm run start-mock
```

#### Pre-requisites:

1. Active NodeJS LTS (Long Term Support) version and associated supported NPM version.  (See https://nodejs.org)



## Segment Dashboard

The app follows `sgd-dashboard-frontend-guideline.md`: one global filter over six cards,
a comparison card with its own period filter, and ratios that come from the CDS views
instead of being recalculated in the browser.

### Structure

```
webapp/
├── manifest.json            libs sap.m, sap.f, sap.ui.comp, sap.ui.layout, sap.viz
│                            the OData model runs with useBatch false on purpose,
│                            so a failing card is easy to find in the network tab
├── i18n/i18n.properties     every text of the app
├── model/SegmentStyle.js    colour per segment code, read from the theme palette
├── model/formatter.js       percentages, signed fluctuation and value states
├── view/Main.view.xml       DynamicPage, FilterBar and the seven cards
└── controller/Main.controller.js
      TIME_CARDS             revenue, gross profit, profit after tax, forex
      MARGIN_CARDS           gross profit margin, net profit margin
      _loadMain              global filter, six parallel requests
      _loadPie               comparison card, two requests
```

Adding a card: create the consumption view with its DCL, expose it in the service
definition, add one entry to `TIME_CARDS`, copy a card block in the view with a new
VizFrame id and `view>/cards/<id>/rows`, and add the title and unit to `i18n`.

### Running with mock data

`npm run start-mock` serves `webapp/localService/mainService/data`. That data covers six
segments from 2024 Q1 to 2025 Q3, with Energy posting a loss, so the negative states and
a quarter without data can both be checked. 2025 Q4 has no data on purpose.

### Approval

Approval is a column of `ZFI_SGD_KPI` and is filtered in the CDS consumption views, so
rows that are not approved never reach the browser. The frontend has no approval logic
and no approval entity of its own.
