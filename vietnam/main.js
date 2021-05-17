const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

const LATEST = 'LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://ncov.moh.gov.vn/';
    const kvStore = await Apify.openKeyValueStore("COVID-19-VIETNAM");
    const dataset = await Apify.openDataset("COVID-19-VIETNAM-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        maxRequestRetries: 1,
        handlePageTimeoutSecs: 60,

        handlePageFunction: async ({ request, $ }) => {
            log.info(`Processing ${request.url}...`);

            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/dtrungtin/covid-vi",
            };

            // const confirmedDateText = $('.journal-content-article h1').text();
            // let matchUpadatedAt = confirmedDateText.match(/(\d+)h(\d+).*(\d+)\/(\d+)\/(\d+)/);

            // if (matchUpadatedAt && matchUpadatedAt.length > 5) {
            //     const dateTimeStr = `${matchUpadatedAt[5]}.${matchUpadatedAt[4]}.${matchUpadatedAt[3]} ${matchUpadatedAt[0]}:${matchUpadatedAt[1]}`;
            //     const dateTime = moment.tz(dateTimeStr, "YYYY.MM.DD h:mm a", 'Asia/Ho_Chi_Minh');

            //     data.lastUpdatedAtSource = dateTime.toISOString();
            // } else {
            //     throw new Error('lastUpdatedAtSource not found');
            // }

            const now = moment();
            const hour = moment(now).tz('Asia/Ho_Chi_Minh').hour();

            if (hour > 6 && hour < 18) {
                data.lastUpdatedAtSource = moment(now).tz('Asia/Ho_Chi_Minh').hour(6).minute(0).second(0).millisecond(0).utc().toISOString();
            } else if (hour < 6) {
                data.lastUpdatedAtSource = moment(now).tz('Asia/Ho_Chi_Minh').subtract(1, 'day').hour(18).minute(0).second(0).millisecond(0).utc().toISOString();
            } else {
                data.lastUpdatedAtSource = moment(now).tz('Asia/Ho_Chi_Minh').hour(18).minute(0).second(0).millisecond(0).utc().toISOString();
            }

            const died = $('#portlet_corona_trangchu_top_CoronaTrangchuTopPortlet_INSTANCE_RrVAbIFIPL7v > div > div.portlet-content-container > div > section.container > div:nth-child(2) > div:nth-child(2) > div > div.col-lg-12.d-none.d-lg-block > div > div:nth-child(2) > div.col.text-center.text-uppercase.text-danger-new1 > span').text().trim();
            const treated = $('#portlet_corona_trangchu_top_CoronaTrangchuTopPortlet_INSTANCE_RrVAbIFIPL7v > div > div.portlet-content-container > div > section.container > div:nth-child(2) > div:nth-child(2) > div > div.col-lg-12.d-none.d-lg-block > div > div:nth-child(2) > div.col.text-center.text-uppercase.text-warning1 > span').text().trim().replace('.','');
            const recovered = $('#portlet_corona_trangchu_top_CoronaTrangchuTopPortlet_INSTANCE_RrVAbIFIPL7v > div > div.portlet-content-container > div > section.container > div:nth-child(2) > div:nth-child(2) > div > div.col-lg-12.d-none.d-lg-block > div > div:nth-child(2) > div.col.text-center.text-uppercase.text-success > span').text().trim().replace('.','');
            const infected = $('#portlet_corona_trangchu_top_CoronaTrangchuTopPortlet_INSTANCE_RrVAbIFIPL7v > div > div.portlet-content-container > div > section.container > div:nth-child(2) > div:nth-child(2) > div > div.col-lg-12.d-none.d-lg-block > div > div:nth-child(2) > div.col.text-center.text-uppercase.text-danger-new > span').text().trim().replace('.','');
            data.infected = Number(infected);
            data.treated = Number(treated);
            data.recovered = Number(recovered);
            data.deceased = Number(died);

            // const table = $('#sailorTable').eq(0);
            // const tableRows = Array.from($(table).find('table > tbody > tr'));
            // const regionData = [];
            // for (const row of tableRows) {
            //     const cells = Array.from($(row).find('td')).map(td => $(td).text().trim());
            //     regionData.push({
            //         region: cells[0],
            //         totalInfected: Number(cells[1]),
            //         activeCases: Number(cells[2]),
            //         recovered: Number(cells[3]),
            //         deceased: Number(cells[4])
            //     });
            // }
            // data.regionData = regionData;

            console.log(data);

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    log.info('Crawler finished.');
});
