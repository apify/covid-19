// main.js
const Apify = require('apify');
const cheerio = require('cheerio');
const { requestAsBrowser, log } = Apify.utils;

const sourceUrl = 'https://github.com/BlankerL/DXY-COVID-19-Data/blob/master/json/DXYOverall.json';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () => {

    log.info('Starting actor.');

    const kvStore = await Apify.openKeyValueStore('COVID-19-CHINA');
    const dataset = await Apify.openDataset('COVID-19-CHINA-HISTORY');
    const { email } = await Apify.getValue('INPUT');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: sourceUrl,
    })
    const basicCrawler = new Apify.BasicCrawler({
        requestQueue,
        useApifyProxy: true,
        maxRequestRetries: 5,
        requestTimeoutSecs: 60,
        handleRequestFunction: async ({ request }) => {
            const { url } = request;
            const response = await requestAsBrowser({
                url,
            });
            const $ = cheerio.load(response.body);

            log.info('Processing and saving data.')

            const now = new Date();
            // text() method sets or returns the text content of the selected elements

            const currentConfirmedCount = $('td:contains("currentConfirmedCount")').eq(1).text().match(/[0-9]+/)[0];
            const confirmedCount = $('td:contains("confirmedCount")').eq(1).text().match(/[0-9]+/)[0]
            const suspectedCount = $('td:contains("suspectedCount")').text().match(/[0-9]+/)[0]
            const curedCount = $('td:contains("curedCount")').eq(1).text().match(/[0-9]+/)[0]
            const deadCount = $('td:contains("deadCount")').eq(1).text().match(/[0-9]+/)[0]
            const seriousCount = $('td:contains("seriousCount")').text().match(/[0-9]+/)[0]

            const data = {
                infected: confirmedCount,
                recovered: curedCount,
                tested: "N/A",
                deceased: deadCount,
                currentConfirmedCount: currentConfirmedCount,
                suspectedCount: suspectedCount,
                seriousCount: seriousCount,
                country: "China",
                historyData: "https://api.apify.com/v2/datasets/LQHrXhGe0EhnCFeei/items?format=json&clean=1",
                sourceUrl: 'https://github.com/BlankerL/DXY-COVID-19-Data/blob/master/json/DXYOverall.json',
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                lastUpdatedAtSource: "N/A",
                readMe: 'https://apify.com/katerinahronik/covid-china',
            };

            console.log(data)

            if (!data.infected) {
                check = true;
            }

            // Push the data
            let latest = await kvStore.getValue(LATEST);
            if (!latest) {
                await kvStore.setValue('LATEST', data);
                latest = Object.assign({}, data);
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            const { itemCount } = await dataset.getInfo();
            if (JSON.stringify(latest) !== JSON.stringify(actual) || itemCount === 0) {
                await dataset.pushData(data);
            }

            await kvStore.setValue('LATEST', data);
            await Apify.pushData(data);

            log.info('Data saved.');

            //if there are no data for TotalInfected, send email, because that means something is wrong
            const env = await Apify.getEnv();
            if (check) {
                await Apify.call(
                    'apify/send-mail',
                    {
                        to: email,
                        subject: `Covid-19 China from ${env.startedAt} failed `,
                        html: `Hi, ${'<br/>'}
                        <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
                     run had 0 currentConfirmedCount, check it out.`,
                    },
                    { waitSecs: 0 },
                );
            };
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request)
        },
    })

    log.debug('Setting up crawler.');

    // Run the crawler and wait for it to finish.
    log.info('Starting the crawl.');
    await basicCrawler.run();
    log.info('Actor finished.');
});
