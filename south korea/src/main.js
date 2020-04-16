// main.js
const Apify = require('apify');
const { log } = Apify.utils;

const LATEST = "LATEST";
const now = new Date();
const sourceUrl = 'http://ncov.mohw.go.kr/en';

Apify.main(async () => {

    log.info('Starting actor.');

    const kvStore = await Apify.openKeyValueStore("COVID-19-SOUTH-KOREA");
    const dataset = await Apify.openDataset("COVID-19-SOUTH-KOREA-HISTORY");

    const requestQueue = await Apify.openRequestQueue();

    await requestQueue.addRequest({
        url: sourceUrl,
    })

    log.debug('Setting up crawler.');
    const cheerioCrawler = new Apify.CheerioCrawler({
        requestQueue,
        maxRequestRetries: 5,
        handlePageTimeoutSecs: 60,
        useApifyProxy: true,
        useSessionPool: true,
        additionalMimeTypes: ['text/plain'],
        sessionPoolOptions: {
            maxPoolSize: 100,
            sessionOptions: {
                maxUsageCount: 5,
            },
        },
        handlePageFunction: async ({ request, $, body }) => {
            log.info(`Processing ${request.url}`);
            log.info(`Processing and saving data.`);
            const data = {};

            const $spans = $('.mps_list li div.mpsl_c span').toArray();

            // ADD: total, infected, discharged, isolated, deceased, beingTested, testedNegative
            ['infected', 'discharged', 'isolated', 'deceased'].forEach((elem, i) => {
                const value = $($spans).eq(i).text().replaceAll();
                if (value || value === '0') {
                    data[elem] = parseInt(value);
                } else {
                    if (elem === 'deceased') {
                        data[elem] = null;
                        return;
                    }
                    data[elem] = 'N/A';
                }
            });

            const testsPerformed = $('.misi_list div.misil_r').eq(0).text().replaceAll();
            const testsConcluded = $('.misi_list div.misil_r').eq(1).text().replaceAll();
            const positivityRate = $('.misi_list div.misil_r').eq(2).text().replaceAll();
            if (testsPerformed) data.testsPerformed = parseInt(testsPerformed);
            if (testsConcluded) data.testsConcluded = parseInt(testsConcluded);
            if (positivityRate) data.positivityRate = positivityRate;

            // Source Date
            const $text = $('.m_patient_status h3 em').text();
            const dateSource = new Date(await formatDate($text));

            //ADD: sourceUrl, lastUpdatedAtSource, lastUpdatedAtApify, readMe
            data.country = 'South Korea';
            data.historyData = 'https://api.apify.com/v2/datasets/Lc0Hoa8MgAbscJA4w/items?format=json&clean=1';
            data.sourceUrl = sourceUrl;
            data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.lastUpdatedAtSource = new Date(Date.UTC(dateSource.getFullYear(), dateSource.getMonth(), dateSource.getDate(), (dateSource.getHours()), dateSource.getMinutes())).toISOString();
            data.readMe = 'https://apify.com/onidivo/covid-kr';

            // Push the data
            let latest = await kvStore.getValue(LATEST);
            if (!latest) {
                await kvStore.setValue('LATEST', data);
                latest = data;
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                await dataset.pushData(data);
            }

            await kvStore.setValue('LATEST', data);
            await Apify.pushData(data);

            console.log('Done.');

        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request)
        },
    });
    // Run the crawler and wait for it to finish.
    log.info('Starting the crawl.');
    await cheerioCrawler.run();
    log.info('Actor finished.');
});

async function formatDate($text) {
    const hour = $text.match(/((( \d{1,2}))|(\b(0?\d|1[0-2]):[0-5]\d))( |)(am|pm)/i)[0].trim();
    const formatedHour = await formatHour(hour);
    const month = $text
        .match(/((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))/i)[0].trim();
    const day = $text.match(/( \d{1,2},)/g)[0].replace(/(,| )/g, '');
    const year = $text.match(/\d{4}/g)[0];
    return `${year}-${month}-${day} ${formatedHour}`;
}

async function formatHour(hour) {
    const cycle = hour.match(/(pm|am)/i)[0].toLowerCase();
    [a, ...others] = hour.replace(/(pm|am)/i, '').trim().split(':');
    if (cycle === 'pm') return [parseInt(a) + 12, others, '00'].join(':');
    return [parseInt(a), others, '00'].join(':');
}

String.prototype.replaceAll = function () {
    return this.replace(/(\n|\t|\r|,| )/g, '');
};
