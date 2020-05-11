const Apify = require('apify');

const { requestAsBrowser, log } = Apify.utils;

const sourceUrl = 'https://covid19.moh.gov.sa/';
const LATEST = 'LATEST';
let check = false;

const REST_HTTP = 'https://services6.arcgis.com/bKYAIlQgwHslVRaK/arcgis/rest/services';
const CITIES_URL = `${REST_HTTP}/VWPlacesUniqueWithStatistics01/FeatureServer/1/query?where=Confirmed_SUM+is+not+null&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&returnGeodetic=false&outFields=*&returnGeometry=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pjson&token=`;
const DAILY_URL = `${REST_HTTP}/DailyCases_Cumulative_ViewLayer/FeatureServer/1/query?where=OBJECTID>0&objectIds=&time=&resultType=none&outFields=*&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnDistinctValues=false&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&sqlFormat=none&f=pjson&token=`;

Apify.main(async () =>

{
    const kvStore = await Apify.openKeyValueStore('COVID-19-SA-TEST');
    const dataset = await Apify.openDataset('COVID-19-SA-HISTORY-TEST');
    

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

        const features = response.body.features;

        if (!features) {
            throw new Error('Missing features property');
        }

        return features.map(({ attributes }) => attributes);
    }

    const [cities, daily] = await Promise.all([
        request(CITIES_URL),
        request(DAILY_URL)
    ]);

    cities.forEach(x =>
    {
        x.Active_SUM = x.Confirmed_SUM - x.Recovered_SUM - x.Deaths_SUM;
        
    });

    const countTotals = (values, key) => values.reduce((total, o) => (total + (o[key] || 0)), 0);
    const lastUpdatedAtSource = daily.reduce((currentTime, o) => (o.Reportdt > currentTime ? o.Reportdt : currentTime), -Infinity);


    const result = {
        infected: countTotals(cities, 'Confirmed_SUM'),
        tested: countTotals(cities, 'Tested_SUM'),
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
            [item.PlaceName_AR]: {
                infected: item.Confirmed_SUM || 0,
                deceased: item.Deaths_SUM || 0,
                active: item.Active_SUM || 0,
                recovered: item.Recovered_SUM || 0,
                tested: item.Tested_SUM || 0,
            }
        }), {})
    };


    console.log(result)

    if ( !result.infected || !result.recovered || !result.deceased|| !result.active) {
            throw "One of the output is null";
            }
    else {
            const missing = daily.filter((item) => item.Reportdt < lowestTimestamp).sort((a, b) => a.Reportdt - b.Reportdt).reduce((out, item) => {
                out[item.Reportdt] = (out[item.Reportdt] || []).concat(item)
                return out
            }, {});

            for (const [date, entries] of Object.entries(missing)) {
                await dataset.pushData({
                    infected: countTotals(entries, 'Confirmed'),
                    tested: "N/A",
                    recovered: countTotals(entries, 'Recovered'),
                    deceased: countTotals(entries, 'Deaths'),
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
