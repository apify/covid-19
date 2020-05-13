const Apify = require('apify');

const { log } = Apify.utils;

Apify.main(async () => {
    const kv = await Apify.openKeyValueStore('COVID-19-BRAZIL');
    const history = await Apify.openDataset('COVID-19-BRAZIL-HISTORY');

    const sourceUrl = 'https://covid.saude.gov.br/';

    const info = await history.getInfo();
    let lastUpdate = new Date();
    let currentData;

    if (info && info.itemCount > 0) {
        currentData = await history.getData({
            limit: 1,
            offset: info.itemCount - 1,
        });

        if (currentData && currentData.items[0] && currentData.items[0].lastUpdatedAtSource) {
            lastUpdate = new Date(currentData.items[0].lastUpdatedAtSource);
            currentData = currentData.items[0]; // eslint-disable-line prefer-destructuring
        }
    }

    const commonHeaders = {
        'X-Parse-Application-Id': 'unAFkcaNDeXajurGB7LChj8SgQYS2ptm',
        Origin: sourceUrl.slice(0, -1),
        Referer: sourceUrl,
    };

    const requestList = await Apify.openRequestList('mapa', [{
        url: 'https://xx9p7hp1p7.execute-api.us-east-1.amazonaws.com/prod/PortalGeralApi',
        headers: {
            ...commonHeaders
        },
        userData: {
            LABEL: 'geral',
        },
    }, {
        url: 'https://xx9p7hp1p7.execute-api.us-east-1.amazonaws.com/prod/PortalEstado',
        headers: {
            ...commonHeaders
        },
        userData: {
            LABEL: 'regions',
        },
    }]);

    log.info(`Last update ${lastUpdate.toISOString()}`);

    /**
     * @param {any[]} values
     * @param {'casosAcumulado'|'obitosAcumulado'} key
     */
    const countTotals = (values, key) => {
        return values.reduce((out, i) => (out + (i[key] || 0)), 0);
    };

    /**
     * @param {any[]} values
     * @param {string} key
     */
    const mapRegions = (values, key) => {
        return values.reduce((out, i) => (out.concat({ state: i.nome, count: i[key] || 0 })), []);
    }

    const version = 4;
    let data = {
        version,
        sourceUrl,
        country: 'Brazil',
        lastUpdatedAtApify: new Date().toISOString(),
        historyData: 'https://api.apify.com/v2/datasets/3S2T1ZBxB9zhRJTBB/items?format=json&clean=1',
        readMe: 'https://apify.com/pocesar/covid-brazil',
        tested: 'N/A',
        recovered: 0,
    };

    let lastUpdatedAtSource;
    let hasNewData = false;

    const latestDate = results => results
        .map(s => new Date(s.updatedAt))
        .reduce((updated, s) => (s.getTime() > updated ? s : updated), new Date(0));

    const crawler = new Apify.CheerioCrawler({
        requestList,
        additionalMimeTypes: ['application/json'],
        useSessionPool: true,
        maxConcurrency: 1,
        useApifyProxy: true,
        maxRequestRetries: 3,
        handlePageTimeoutSecs: 180,
        handlePageFunction: async ({ request, json }) => {
            const { LABEL } = request.userData;

            if (!json || (LABEL === 'regions' && (!Array.isArray(json) || json.length < 27))) {
                await Apify.setValue(`results-${Math.random()}`, { json });
                throw new Error('Results are empty');
            }

            if (LABEL === 'geral') {
                const { dt_updated, confirmados } = json;

                if (!dt_updated || !confirmados) {
                    throw new Error('Missing "dt_updated" or "confirmados" on data');
                }

                const dateModified = new Date(dt_updated);

                if (Number.isNaN(dateModified.getTime())) {
                    log.warning('Invalid date', { dateModified, dt_updated });

                    throw new Error('Invalid date');
                }

                if (dateModified.getTime() <= lastUpdate.getTime()) {
                    log.debug('Last modified update not greater', { lastUpdate, dateModified });
                    return;
                }

                if (!lastUpdatedAtSource || dateModified.getTime() > lastUpdatedAtSource.getTime()) {
                    lastUpdatedAtSource = dateModified;
                }

                if (lastUpdatedAtSource.getTime() <= lastUpdate.getTime()) {
                    log.debug('Last source update not greater', { lastUpdatedAtSource, lastUpdate });
                    return;
                }

                data.recovered = +`${confirmados.recuperados}`.replace(/[^\d]+/g, '');
                data.lastUpdatedAtSource = lastUpdatedAtSource.toISOString();

                hasNewData = true;
            } else if (LABEL === 'regions' && hasNewData) {
                data = {
                    ...data,
                    lastUpdatedAtSource: lastUpdatedAtSource.toISOString(),
                    infected: countTotals(json, 'casosAcumulado'),
                    deceased: countTotals(json, 'obitosAcumulado'),
                    infectedByRegion: mapRegions(json, 'casosAcumulado'),
                    deceasedByRegion: mapRegions(json, 'obitosAcumulado'),
                };
            }
        },
        handleFailedRequestFunction: ({ error }) => {
            log.exception(error, 'Failed after all retries');
            process.exit(1);
        },
    });

    await crawler.run();

    if (!hasNewData) {
        log.info('No new data', { lastUpdatedAtSource, lastUpdate });

        // no new data, don't fail, just update the timestamp
        if (currentData) {
            currentData = {
                ...currentData,
                lastUpdatedAtApify: new Date().toISOString(),
            };

            await Apify.pushData(currentData);
            await kv.setValue('LATEST', currentData);
        }

        return;
    }

    if (!data || !lastUpdatedAtSource) {
        throw new Error('Missing data');
    }

    const checkRegions = item => !Number.isInteger(item.count) || !item.state || item.state.length !== 2;

    // sanity check before updating, the data is seldomly unreliable
    if (!Number.isInteger(data.deceased)
        || !Number.isInteger(data.infected)
        || !data.infected
        || !data.deceased
        || !data.deceasedByRegion
        || !data.infectedByRegion
        || data.deceasedByRegion.length !== 27
        || data.infectedByRegion.length !== 27
        || data.deceasedByRegion.some(checkRegions)
        || data.infectedByRegion.some(checkRegions)
    ) {
        await Apify.setValue('data', data);

        throw new Error('Data check failed');
    }

    await kv.setValue('LATEST', data);

    if (lastUpdate.toISOString() !== lastUpdatedAtSource) {
        await history.pushData(data);
    }

    // always push data to default dataset
    await Apify.pushData(data);

    log.info('Done');
});
