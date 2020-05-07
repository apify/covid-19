const Apify = require('apify');
const {log, requestAsBrowser} = Apify.utils;

const LABELS = {
    TOTAL: 'TOTAL',
    OKRESY: 'OKRESY'
};

const LATEST = "LATEST";

Apify.main(async () => {
    const { notificationEmail } = await Apify.getInput();
    const url = "https://www.arcgis.com/apps/opsdashboard/index.html#/5fe83e34abc14349b7d2fcd5c48c6c85";
    const kvStore = await Apify.openKeyValueStore("COVID-19-SLOVAK-3");
    const dataset = await Apify.openDataset("COVID-19-SLOVAK-3-HISTORY");
    const requestList = await Apify.openRequestList('LIST', [
        {
            url: 'https://services.arcgis.com/s2Iyql6ZO52bpobk/arcgis/rest/services/2020_covid_sk_denny_sumar_verejn%C3%BD_poh%C4%BEad/FeatureServer/0/query?f=json&cacheHint=true&resultOffset=0&resultRecordCount=1&where=1%3D1&orderByFields=Datum%20DESC&outFields=*&resultType=standard&returnGeometry=false&spatialRel=esriSpatialRelIntersects',
            userData: { label: LABELS.TOTAL }
        },
        {
            url: 'https://services.arcgis.com/s2Iyql6ZO52bpobk/arcgis/rest/services/Join_Hranice_okresy_covid/FeatureServer/0/query?f=json&cacheHint=true&resultOffset=0&resultRecordCount=75&where=1%3D1&orderByFields=celkom_pozitivni%20DESC&outFields=*&resultType=standard&returnGeometry=false&spatialRel=esriSpatialRelIntersects',
            userData: { label: LABELS.OKRESY }
        },
    ])
    let totalInfected = 0;
    let totalDeceased = 0;
    let totalNegative = 0;
    let totalRecovered = 0;
    let infectedByRegion = [];

    const crawler = new Apify.BasicCrawler({
        requestList,
        handleRequestFunction: async ({request}) => {
            const { label } = request.userData;
            let response;
            let body;
            let $;
            let tableRows;
            switch (label) {
                case LABELS.TOTAL:
                    response = await requestAsBrowser({
                        url: request.url,
                        json:true,
                    });
                    body = response.body;
                    totalInfected = body.features[0].attributes.celkom_pozitivni;
                    totalDeceased = body.features[0].attributes.mrtvi;
                    totalNegative = body.features[0].attributes.celkom_negativne_testy;
                    totalRecovered = body.features[0].attributes.vyzdraveni;
                    break;
                case LABELS.OKRESY:
                    response = await requestAsBrowser({
                        url: request.url,
                        json:true,
                    });
                    body = response.body;
                    for (const okres of body.features) {
                        const attributes = okres.attributes;
                        infectedByRegion.push({
                            region: attributes.NAZOV,
                            infectedCount: attributes.celkom_pozitivni,
                        });
                    }
                    break;
            }
        }
    });

    log.info('CRAWLER -- start');
    await crawler.run();
    log.info('CRAWLER -- finish');

    console.log(`Processing and saving data.`);

    const now = new Date();

    const data = {
        infected: parseInt(totalInfected),
        negative: parseInt(totalNegative),
        tested: parseInt(totalInfected) + parseInt(totalNegative),
        recovered: parseInt(totalRecovered),
        deceased: parseInt(totalDeceased),
        infectedByRegion,
        country: "Slovakia",
        historyData: "https://api.apify.com/v2/datasets/oUWi8ci7F2R9V5ZFy/items?format=json&clean=1",
        sourceUrl: url,
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: "https://apify.com/davidrychly/covid-sk-3",
    };

    // Compare and save to history
    const latest = await kvStore.getValue(LATEST);
    if (latest && latest.lastUpdatedAtApify) {
        delete latest.lastUpdatedAtApify;
    }
    if (data.infected === 0 || data.deceased === 0) {
        log.error('Latest data are high then actual - probably wrong scrap');
        log.info('ACTUAL DATA');
        console.log(data);
        log.info('LATEST DATA');
        console.log(latest);
        process.exit(1);
    }
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
    }

    await kvStore.setValue(LATEST, data);
    await Apify.pushData(data);

    console.log('Done.');
});
