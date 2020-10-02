const Apify = require('apify');
const SOURCE_URL = 'https://koroonakaart.ee/';
const LATEST = 'LATEST';
const { log, requestAsBrowser } = Apify.utils;

const LABELS = {
    GOV: 'GOV',
    WIKI: 'WIKI',
};

Apify.main(async () => {
    const { notificationEmail, failedLimit = 5 } = await Apify.getInput();
    const requestQueue = await Apify.openRequestQueue();
    let failedBefore = (await Apify.getValue('COVID-19-ESTONIA-FAILD')) || 0;
    const kvStore = await Apify.openKeyValueStore('COVID-19-ESTONIA');
    const dataset = await Apify.openDataset("COVID-19-ESTONIA-HISTORY");
    await requestQueue.addRequest({ url: SOURCE_URL, userData: { label: LABELS.GOV } });

    if (notificationEmail && failedLimit < failedBefore) {
        await Apify.addWebhook({
            eventTypes: ['ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT'],
            requestUrl: `https://api.apify.com/v2/acts/mnmkng~email-notification-webhook/runs?token=${Apify.getEnv().token}`,
            payloadTemplate: `{"notificationEmail": "${notificationEmail}", "eventType": {{eventType}}, "eventData": {{eventData}}, "resource": {{resource}} }`,
        });
    }

    let totalInfected = 0;
    let tested = undefined;
    let totalDeceased = undefined;
    let totalRecovered = undefined;
    const proxyConfiguration = await Apify.createProxyConfiguration();

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        handlePageTimeoutSecs: 120,
        proxyConfiguration,
        gotoFunction: async ({ page, request }) => {
            await page.on('response', async(interceptedRequest) => {
                if (interceptedRequest.url().endsWith('.js') && interceptedRequest.url().includes('koroonakaart.ee/js/app')) {
                    log.info(`Reading ${interceptedRequest.url()}`);
                    try {
                        let body = await interceptedRequest.text();
                        log.info('Getting city and province data out of file');
                        let start = body.indexOf('5033:function(t)');
                        let end = body.indexOf(',"dates1":')
                        body = body.substring(start, end);
                        start = body.indexOf('{"')
                        body = body.substring(start);
                        body = `${body}}`;
                        body = JSON.parse(body);
                        totalInfected = body.confirmedCasesNumber;
                        tested = body.testsAdministeredNumber;
                        totalDeceased = body.deceasedNumber;
                        totalRecovered = body.recoveredNumber;
                    } catch (err) {
                        log.error(err)
                    }
                }
            });
            return page.goto(request.url, { waitUntil: 'networkidle2', timeout: 300000 });
        },
        handlePageFunction: async ({ request }) => {
            const { label } = request.userData;
            let response;
            let body;
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
        recovered: parseInt(totalRecovered, 10),
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
        failedBefore = failedBefore + 1;
        await Apify.setValue('COVID-19-ESTONIA-FAILD', failedBefore);
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

    await Apify.setValue('COVID-19-ESTONIA-FAILD', 0);
    await kvStore.setValue(LATEST, data);
    log.info('Data stored, finished.');
});
