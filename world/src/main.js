const Apify = require('apify');
const transformSchema = require('./transform-schema');

const LATEST = 'LATEST';
const NO_DATA_PLACEHOLDER = 'NA';
const removeEmoji = (countryTitle) => {
    return countryTitle.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '').trim();
};

const getValue = (schema, data, prop) => {
    const value = schema[prop];
    return value === undefined ? NO_DATA_PLACEHOLDER : parseInt(data[schema[prop]], 10);
};
const transformCoreData = (schema, countryData) => {
    return {
        infected: getValue(schema, countryData, 'infected'),
        tested: getValue(schema, countryData, 'tested'),
        recovered: getValue(schema, countryData, 'recovered'),
        deceased: getValue(schema, countryData, 'deceased'),

    };
};
Apify.main(async () => {
    const kvStore = await Apify.openKeyValueStore('COVID-19-WORLD');
    const dataset = await Apify.openDataset('COVID-19-WORLD-HISTORY');

    const response = await Apify.utils.requestAsBrowser({
        url: 'https://raw.githubusercontent.com/apifytech/apify-web-covid-19/master/covid_api_list.json',
        abortFunction: () => false,
        json: true,
    });
    const data = [];
    const dataSources = response.body;
    for (const source of dataSources) {
        const { body: countryData } = await Apify.utils.requestAsBrowser({
            url: source.latestApi.url,
            abortFunction: () => false,
            json: true,
        });
        const countryName = removeEmoji(source.title);
        const countrySchema = transformSchema[countryName];

        if (countrySchema) {
            console.log('Saving data for: ', source.title);
            const metaData = {
                country: countryName,
                moreData: source.latestApi.url,
                historyData: source.historyApi.url,
                sourceUrl: countryData.sourceUrl,
                lastUpdatedSource: countryData.lastUpdatedAtSource,
                lastUpdatedApify: countryData.lastUpdatedAtApify,
            };

            switch (countryName) {
                case 'Slovakia':
                    data.push({
                        infected: countryData.totalInfected,
                        tested: countryData.totalInfected + countryData.totalNegative,
                        recovered: NO_DATA_PLACEHOLDER,
                        deceased: NO_DATA_PLACEHOLDER,
                        ...metaData,
                    });
                    break;
                default:
                    data.push({
                        ...transformCoreData(countrySchema, countryData),
                        ...metaData,
                    });
            }
        }
    }

    // Compare and save to history
    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', data);
        latest = data;
    }
    const actual = Object.assign({}, data);

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(data);
    }

    await kvStore.setValue(LATEST, data);
    await Apify.pushData(data);
    console.log('Done.');
});
