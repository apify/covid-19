const Apify = require('apify');
const SOURCE_URL = 'https://www.terviseamet.ee/en/covid19';
const LATEST = 'LATEST';
const { log } = Apify.utils;

const LABELS = {
    GOV: 'GOV',
    WIKI: 'WIKI',
};

Apify.main(async () => {
    const { notificationEmail } = await Apify.getInput();
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-ESTONIA');
    const dataset = await Apify.openDataset("COVID-19-ESTONIA-HISTORY");
    await requestQueue.addRequest({ url: SOURCE_URL, userData: { label: LABELS.GOV} });

    if (notificationEmail) {
        await Apify.addWebhook({
            eventTypes: ['ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT'],
            requestUrl: `https://api.apify.com/v2/acts/mnmkng~email-notification-webhook/runs?token=${Apify.getEnv().token}`,
            payloadTemplate: `{"notificationEmail": "${notificationEmail}", "eventType": {{eventType}}, "eventData": {{eventData}}, "resource": {{resource}} }`,
        });
    }

    let totalInfected = 0;
    let tested = undefined;
    let totalDeceased = undefined;

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        handlePageTimeoutSecs: 120,
        handlePageFunction: async ({ $, request }) => {
            const { label } = request.userData;
            switch (label) {
                case LABELS.GOV:
                    const infoBoxes = $('.first').toArray();
                    for (let box of infoBoxes) {
                        const head = $(box).find('h2');
                        if (head.text().trim() === 'CURRENT SITUATION IN ESTONIA') {
                            const lastColumn = $(box).find('.last');
                            tested = lastColumn.eq(0).text().trim();
                            totalInfected = lastColumn.eq(1).text().trim();
                            totalDeceased = lastColumn.eq(2).text().trim();
                            tested = tested.replace(' ', '');
                            totalInfected = totalInfected.replace(' ', '');
                            totalDeceased = totalDeceased.replace('.', '');
                        }
                    }
                    // await requestQueue.addRequest({ url: 'https://en.wikipedia.org/wiki/2020_coronavirus_pandemic_in_Estonia', userData: { label: LABELS.WIKI }});
                    break;
                case LABELS.WIKI:
                    const tableRows = $('table.infobox tr').toArray();
                    for (const row of tableRows) {
                        const $row = $(row);
                        const th = $row.find('th');
                        if (th) {
                            const value = $row.find('td');
                            if (th.text().trim() === 'Deaths') {
                                totalDeceased = value.text().trim();
                            }
                        }
                    }
                    break;
            }
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    log.info('CRAWLER -- start');
    await crawler.run();
    log.info('CRAWLER -- finish');

    const data = {
        infected: parseInt(totalInfected, 10),
        tested: parseInt(tested, 10),
        deceased: parseInt(totalDeceased, 10),
        country: 'Estonia',
        moreData: 'https://api.apify.com/v2/key-value-stores/AZUhwS51lBBg26wSG/records/LATEST?disableRedirect=true',
        historyData: 'https://api.apify.com/v2/datasets/Ix8h3SN2Ngyukf7yM/items?format=json&clean=1',
        SOURCE_URL,
        lastUpdatedAtApify: new Date(new Date().toUTCString()).toISOString(),
        readMe: 'https://apify.com/lukass/covid-est',
    };

    // Compare and save to history
    const latest = await kvStore.getValue(LATEST);
    if (latest){
        delete latest.lastUpdatedAtApify;
    }
    if (latest && (latest.infected > data.infected)) {
        log.error('Latest data are high then actual - probably wrong scrap');
        console.log(latest);
        console.log(data);
        process.exit(1);
    }
    const actual = Object.assign({}, data);
    delete actual.lastUpdatedAtApify;
    await Apify.pushData(actual);

    if(JSON.stringify(latest)!== JSON.stringify(actual)){
        log.info('Data did change :( storing new to dataset.');
        await dataset.pushData(data);
    }

    await kvStore.setValue(LATEST, data);
    log.info('Data stored, finished.');
});
