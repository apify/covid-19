const Apify = require('apify');

const { requestAsBrowser, log } = Apify.utils;

const sourceUrl = 'https://covid19.moh.gov.sa/';
const LATEST = 'LATEST';
let check = false;

const REST_HTTP = 'https://services8.arcgis.com/uiAtN7dLXbrrdVL5/arcgis/rest/services';
const CITIES_URL = `${REST_HTTP}/Saudi_COVID19_Statistics/FeatureServer/1/query?f=json&where=1=1&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=Name%2CConfirmed_SUM%2CRecovered_SUM%2CDeaths_SUM%2CActive_SUM&orderByFields=Name%20asc&resultOffset=0&resultRecordCount=100&cacheHint=true`;
const DAILY_URL = `${REST_HTTP}/COVID19_Daily_Progressive_Cases_V2/FeatureServer/0/query?f=json&where=1%3D1&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=Name%2CDate%2CConfirmed%2CDeaths%2CRecovered%2CActive&orderByFields=Date%20asc&resultOffset=0&resultRecordCount=2000&cacheHint=true`;

Apify.main(async () =>

{
    const kvStore = await Apify.openKeyValueStore('COVID-19-SA');
    const dataset = await Apify.openDataset('COVID-19-SA-HISTORY');
    const { email } = await Apify.getValue('INPUT');

try{
    const { items } = await dataset.getData({ fields: ['lastUpdatedAtApify', 'lastUpdatedAtSource'] });

    // fill the gap in case it's missing historic data
    const timestamps = items
        .map(s => new Date(s.lastUpdatedAtSource !== 'N/A' ? s.lastUpdatedAtSource : s.lastUpdatedAtApify).getTime())
        .filter(s => !Number.isNaN(s));

    const lowestTimestamp = Math.min(...timestamps);
    const highestTimestamp = Math.max(...timestamps);

    log.info('Timestamps', { lowestTimestamp: new Date(lowestTimestamp), highestTimestamp: new Date(highestTimestamp) });

    const request = async (url) => {
        const response = await requestAsBrowser({
            url,
            json: true,
            abortFunction: () => false,
            headers: {
                Referer: 'https://esriksa-emapstc.maps.arcgis.com/apps/opsdashboard/index.html',
                Origin: 'https://esriksa-emapstc.maps.arcgis.com'
            }
        });

        if (response.statusCode !== 200 || !response.body) {
            throw new Error('Failed to download');
        }

        const { features } = response.body;

        if (!features) {
            throw new Error('Missing features property');
        }

        return features.map(({ attributes }) => attributes);
    }

    const [cities, daily] = await Promise.all([
        request(CITIES_URL),
        request(DAILY_URL)
    ]);

    const countTotals = (values, key) => values.reduce((total, o) => (total + (o[key] || 0)), 0);
    const lastUpdatedAtSource = daily.reduce((currentTime, o) => (o.Date > currentTime ? o.Date : currentTime), -Infinity);

    const result = {
        infected: countTotals(cities, 'Confirmed_SUM'),
        tested: "N/A",
        recovered: countTotals(cities, 'Recovered_SUM'),
        deceased: countTotals(cities, 'Deaths_SUM'),
        active: countTotals(cities, 'Active_SUM'),
        lastUpdatedAtSource: new Date(lastUpdatedAtSource).toISOString(),
        country: "SA",
        historyData: "https://api.apify.com/v2/datasets/OeaEEGdhvUSkXRrWU/items?format=json&clean=1",
        sourceUrl,
        lastUpdatedAtApify: new Date().toISOString(),
        readMe: 'https://apify.com/katerinahronik/covid-sa',
        ...cities.reduce((out, item) => ({
            ...out,
            [item.Name]: {
                infected: item.Confirmed_SUM || 0,
                deceased: item.Deaths_SUM || 0,
                active: item.Active_SUM || 0,
                recovered: item.Recovered_SUM || 0,
            }
        }), {})
    };

    console.log(result)

    if ( !result.infected || !result.recovered || !result.deceased|| !result.active) {
            throw "One of the output is null";
            }
    else {
            const missing = daily.filter((item) => item.Date < lowestTimestamp).sort((a, b) => a.Date - b.Date).reduce((out, item) => {
                out[item.Date] = (out[item.Date] || []).concat(item)
                return out
            }, {});

            for (const [date, entries] of Object.entries(missing)) {
                await dataset.pushData({
                    infected: countTotals(entries, 'Confirmed'),
                    tested: "N/A",
                    recovered: countTotals(entries, 'Recovered'),
                    deceased: countTotals(entries, 'Deaths'),
                    active: countTotals(entries, 'Active'),
                    lastUpdatedAtSource: new Date(+date).toISOString(),
                    country: "SA",
                    historyData: "https://api.apify.com/v2/datasets/OeaEEGdhvUSkXRrWU/items?format=json&clean=1",
                    sourceUrl,
                    lastUpdatedAtApify: new Date().toISOString(),
                    readMe: 'https://apify.com/katerinahronik/covid-sa',
                    ...entries.reduce((out, item) => ({
                        ...out,
                        [item.Name]: {
                            infected: item.Confirmed || 0,
                            deceased: item.Deaths || 0,
                            active: item.Active || 0,
                            recovered: item.Recovered || 0,
                        }
                    }), {})
                })
            }

            let latest = await kvStore.getValue(LATEST);
            if (!latest) {
                await kvStore.setValue(LATEST, result);
                latest = result;
            }

            const { lastUpdatedAtApify: _1, lastUpdatedAtSource: _3, ...latestRest } = latest;
            const { lastUpdatedAtApify: _2, lastUpdatedAtSource: _4, ...resultRest } = result;

            if (JSON.stringify(latestRest) !== JSON.stringify(resultRest)) {
                await dataset.pushData(result);
            }

            await kvStore.setValue(LATEST, result);
            await Apify.pushData(result);
        }

    console.log('Done.');

    // if there are no data for TotalInfected, send email, because that means something is wrong
    // const env = await Apify.getEnv();
    // if (check) {
    //     await Apify.call(
    //         'apify/send-mail',
    //         {
    //             to: email,
    //             subject: `Covid-19 SA from ${env.startedAt} failed `,
    //             html: `Hi, ${'<br/>'}
    //                     <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a>
    //                     run had 0 in some of the variables, check it out.`,
    //         },
    //         { waitSecs: 0 },
    //     );
    // };
}

catch(err) {

    console.log(err)

    let latest = await kvStore.getValue(LATEST);
    var latestKvs = latest.lastUpdatedAtApify;
    var latestKvsDate = new Date(latestKvs)
    var d = new Date();
    // adding two hours to d
    d.setHours(d.getHours() - 2);
    if (latestKvsDate < d) {
        throw (err)
    }
}
});

