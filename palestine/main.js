const Apify = require('apify');
const cheerio = require('cheerio');
const { requestAsBrowser, log } = Apify.utils;

const LATEST = 'LATEST';
const now = new Date();
const sourceUrl = 'http://site.moh.ps/index/covid19/LanguageVersion/1/Language/ar';

const toNumber = (str) => parseInt(str.match(/[0-9]+/)[0]);

Apify.main(async () => {
    log.info('Starting actor.');

    const kvStore = await Apify.openKeyValueStore('COVID-19-PALESTINE');
    const dataset = await Apify.openDataset('COVID-19-PALESTINE-HISTORY');

    const requestList = new Apify.RequestList({
        sources: [{
            url: sourceUrl,
        }]
    });
    await requestList.initialize();

    let requestFailedCompletely = false;
    const basicCrawler = new Apify.BasicCrawler({
        requestList,
        useApifyProxy: true,
        maxRequestRetries: 5,
        requestTimeoutSecs: 60,
        handleRequestFunction: async ({ request }) => {
            const { url, headers } = request;
            const response = await requestAsBrowser({
                url,
                headers: { ...headers },
                ignoreSslErrors: false,
                followRedirect: false,
            });
            const $ = cheerio.load(response.body);

            log.info('Processing and saving data.')
            const data = {};

            // ADD: infected, tested, recovered, deceased, active, newCases, newlyRecovered
            const $values = $('.table.table-bordered').eq(0).find('tbody tr').eq(0).find('td');

            data.infected = toNumber($($values[1]).text());
            data.tested = toNumber($('.table.table-bordered').eq(14).find('tfoot').text())
            data.recovered = toNumber($($values[2]).text());
            data.deceased = toNumber($($values[3]).text())
            data.active = toNumber($($values[4]).text())
            data.newCases = toNumber($('.table.table-bordered').eq(1).find('tfoot').text());
            data.newlyRecovered = toNumber($('.table.table-bordered').eq(3).find('tfoot').text())
            data.atHome = toNumber($('.table.table-bordered').eq(16).find('tfoot').text())

            // ADD: infecterByRegion
            let activeVlues = new Map()
            $('.table.table-bordered').eq(7).find('tbody tr').toArray().forEach(tr => {
                activeVlues.set(
                    $(tr).find('td').eq(0).text().trim(),
                    $(tr).find('td').eq(1).text().trim())
            })
            data.infecterByRegion = $('.table.table-bordered').eq(8).find('tbody tr').toArray().map(tr => {
                const region = $(tr).find('td').eq(0).text().trim();
                return {
                    region,
                    infected: $(tr).find('td').eq(1).text().trim(),
                    active: activeVlues.get(region),
                }
            })

            // ADD: country, historyData, sourceUrl, lastUpdatedAtSource, lastUpdatedAtApify, readMe
            data.country = 'Palestine';
            data.historyData = 'https://api.apify.com/v2/datasets/BKpHLQrJPmgXE51tf/items?format=json&clean=1';
            data.sourceUrl = sourceUrl;
            data.lastUpdatedAtApify = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.lastUpdatedAtSource = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString();
            data.readMe = 'https://apify.com/onidivo/covid-ps';

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
        },
        handleFailedRequestFunction: async ({ request }) => {
            requestFailedCompletely = true;
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request)
        },
    })
    log.debug('Setting up crawler.');

    // Run the crawler and wait for it to finish.
    log.info('Starting the crawl.');
    await basicCrawler.run();
    if (requestFailedCompletely) {
        throw new Error('The request failed completely. See the log for info.');
    }
    log.info('Actor finished.');
});
