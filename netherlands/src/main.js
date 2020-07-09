const Apify = require('apify');
const SOURCE_URL = 'https://www.rivm.nl/en/novel-coronavirus-covid-19/current-information';
const LATEST = 'LATEST';
const {log, requestAsBrowser} = Apify.utils;

const LABELS = {
    GOV: 'GOV',
    WIKI: 'WIKI',
    GIS: 'GIS'
};

Apify.main(async () => {
    const { notificationEmail } = await Apify.getInput();
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-NL');
    const dataset = await Apify.openDataset("COVID-19-NL-HISTORY");
    await requestQueue.addRequest({ url: 'https://services9.arcgis.com/N9p5hsImWXAccRNI/arcgis/rest/services/Nc2JKvYFoAEOFCG5JSI6/FeatureServer/2/query?f=json&where=(Recovered%3C%3E0)%20AND%20(OBJECTID%3D12)&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=*&orderByFields=Recovered%20desc&outSR=102100&resultOffset=0&resultRecordCount=250&resultType=standard&cacheHint=true', userData: { label: LABELS.GIS }});

    if (notificationEmail) {
        await Apify.addWebhook({
            eventTypes: ['ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT'],
            requestUrl: `https://api.apify.com/v2/acts/mnmkng~email-notification-webhook/runs?token=${Apify.getEnv().token}`,
            payloadTemplate: `{"notificationEmail": "${notificationEmail}", "eventType": {{eventType}}, "eventData": {{eventData}}, "resource": {{resource}} }`,
        });
    }

    let totalInfected = 0;
    let totalDeceased = undefined;
    const proxyConfiguration = await Apify.createProxyConfiguration();

    const crawler = new Apify.BasicCrawler({
        requestQueue,
        maxRequestRetries: 2,
        handleRequestTimeoutSecs: 120,
        handleRequestFunction: async ({ request}) => {
            const { label } = request.userData;
            let response;
            switch (label) {
                case LABELS.GIS:
                    response = await requestAsBrowser({
                        url: request.url,
                        headers: {
                            referer: 'https://gisanddata.maps.arcgis.com/apps/opsdashboard/index.html'
                        },
                        proxyUrl: proxyConfiguration.newUrl(),
                        json: true,
                    });
                    if (response.statusCode === 200) {
                        const attributes = response.body.features[0].attributes;
                        totalInfected = attributes.Confirmed;
                        totalDeceased = attributes.Deaths;
                    }
                    break;
                case LABELS.WIKI: // deprecated
                    const tableRows = $('table.infobox tr').toArray();
                    for (const row of tableRows) {
                        const $row = $(row);
                        const th = $row.find('th');
                        if (th) {
                            const value = $row.find('td');
                            if (th.text().trim() === 'Deaths') {
                                totalDeceased = value.text().trim().replace(',','');
                            } else if (th.text().trim() === 'Confirmed cases') {
                                totalInfected = value.text().trim().replace(',','');
                            }
                        }
                    }
                    break;
            }

        },
        handleFailedRequestFunction: async ({request}) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    log.info('CRAWLER -- start');
    await crawler.run();
    log.info('CRAWLER -- finish');

    const data = {
        infected: parseInt(totalInfected, 10),
        tested: undefined,
        deceased: parseInt(totalDeceased, 10),
        country: 'Netherlands',
        moreData: 'https://api.apify.com/v2/key-value-stores/vqnEUe7VtKNMqGqFF/records/LATEST?disableRedirect=true',
        historyData: 'https://api.apify.com/v2/datasets/jr5ogVGnyfMZJwpnB/items?format=json&clean=1',
        SOURCE_URL,
        lastUpdatedAtApify: new Date(new Date().toUTCString()).toISOString(),
        readMe: 'https://apify.com/lukass/covid-nl',
    };

    // Compare and save to history
    const latest = await kvStore.getValue(LATEST);
    if (latest) {
        delete latest.lastUpdatedAtApify;
    }
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;
    await Apify.pushData(data);

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        log.info('Data did change :( storing new to dataset.');
        await dataset.pushData(data);
    }

    if (latest.infected > actual.infected || latest.deceased > actual.deceased) {
        log.error('Actual numbers are lower then latest probably wrong parsing');
        process.exit(1);
    }

    await kvStore.setValue(LATEST, data);
    log.info('Data stored, finished.');
});
