const Apify = require('apify');
const {load} = require('cheerio');
const SOURCE_URL = 'https://mhlw-gis.maps.arcgis.com/apps/opsdashboard/index.html#/0c5d0502bbb54f9a8dddebca003631b8';
const LATEST = 'LATEST';
const {log, requestAsBrowser} = Apify.utils;

const LABELS = {
    GOV: 'GOV',
    WIKI: 'WIKI',
};

Apify.main(async () => {
    const { notificationEmail } = await Apify.getInput();
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-JAPAN');
    const dataset = await Apify.openDataset("COVID-19-JAPAN-HISTORY");
    await requestQueue.addRequest({url: 'https://services8.arcgis.com/JdxivnCyd1rvJTrY/arcgis/rest/services/covid19_list_csv_EnglishView/FeatureServer/0/query?f=json&where=%E7%A2%BA%E5%AE%9A%E6%97%A5%20IS%20NOT%20NULL&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=*&orderByFields=%E7%A2%BA%E5%AE%9A%E6%97%A5%20asc&resultOffset=0&resultRecordCount=2000&cacheHint=true',
        userData: { label: LABELS.GOV } });

    if (notificationEmail) {
        await Apify.addWebhook({
            eventTypes: ['ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT'],
            requestUrl: `https://api.apify.com/v2/acts/mnmkng~email-notification-webhook/runs?token=${Apify.getEnv().token}`,
            payloadTemplate: `{"notificationEmail": "${notificationEmail}", "eventType": {{eventType}}, "eventData": {{eventData}}, "resource": {{resource}} }`,
        });
    }

    let totalInfected = 0;
    let totalDeceased = 0;
    let infectedByRegion = [];

    const crawler = new Apify.BasicCrawler({
        requestQueue,
        handleRequestFunction: async ({request}) => {
            console.log('CRAWLER -- start with page');
            const { label } = request.userData;
            let response;
            let body;
            switch (label) {
                case LABELS.GOV:
                    response = await requestAsBrowser({
                        url: request.url,
                        json:true,
                    });
                    body = response.body;
                    const prefectureMap = new Map();
                    for (const feature of body.features) {
                        prefectureMap.set(feature.attributes.Prefectures, feature.attributes['都道府県別事例数']);
                    }
                    for (let [key, value] of prefectureMap) {
                        console.log(key + ' = ' + value);
                        totalInfected += value;
                        infectedByRegion.push({
                            region: key,
                            infectedCount: value,
                            deceasedCount: undefined
                        });
                    }
                    await requestQueue.addRequest({ url: 'https://en.wikipedia.org/wiki/2020_coronavirus_pandemic_in_Japan#cite_note-mhlw-1', userData: { label: LABELS.WIKI }});
                    break;
                case LABELS.WIKI:
                    response = await requestAsBrowser({
                        url: request.url,
                    });
                    body = response.body;
                    const $ = load(body);
                    const tableRows = $('table.infobox tr').toArray();
                    for (const row of tableRows) {
                        const $row = $(row);
                        const th = $row.find('th');
                        if (th) {
                            const value = $row.find('td');
                            if (th.text().trim() === 'Deaths') {
                                totalDeceased = value.text().trim();
                            }
                            if (th.text().trim() === 'Confirmed cases') {
                                let trimValue = value.text().trim().replace(',', '');
                                if (totalInfected < parseInt(trimValue)){
                                    totalInfected = parseInt(trimValue);
                                }
                            }
                        }
                    }
                    break;
            }
        }
    });

    log.info('CRAWLER -- start');
    await crawler.run();
    log.info('CRAWLER -- finish');

    const data = {
        infected: totalInfected,
        tested: undefined,
        deceased: parseInt(totalDeceased, 10),
        infectedByRegion,
        country: 'Japan',
        moreData: 'https://api.apify.com/v2/key-value-stores/YbboJrL3cgVfkV1am/records/LATEST?disableRedirect=true',
        historyData: 'https://api.apify.com/v2/datasets/ugfJOQkPhQ0fvLYzN/items?format=json&clean=1',
        SOURCE_URL,
        lastUpdatedAtApify: new Date(new Date().toUTCString()).toISOString(),
        readMe: 'https://apify.com/lukass/covid-jap',
    };

    // Compare and save to history
    const latest = await kvStore.getValue(LATEST);
    if (latest) {
        delete latest.lastUpdatedAtApify;
    }
    if (latest.infected > data.infected || latest.deceased > data.deceased) {
        log.error('Latest data are high then actual - probably wrong scrap');
        log.info('ACTUAL DATA');
        console.log(data);
        log.info('LATEST DATA');
        console.log(latest);
        process.exit(1);
    }
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;
    await Apify.pushData(data);

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        log.info('Data did change :( storing new to dataset.');
        await dataset.pushData(data);
    }

    await kvStore.setValue(LATEST, data);
    log.info('Data stored, finished.')
});
