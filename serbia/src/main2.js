const Apify = require('apify');
const httpRequest = require('@apify/http-request')
const cheerio = require('cheerio');
const sourceUrl = 'https://covid19.rs/homepage-english/';
const LATEST = 'LATEST';

Apify.main(async () => {
  const kvStore = await Apify.openKeyValueStore('COVID-19-SERBIA');
  const dataset = await Apify.openDataset('COVID-19-SERBIA-HISTORY');

    console.log('Getting data...');
    const { body } = await httpRequest({ url: sourceUrl });
    const $ = cheerio.load(body);
    const infected = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-6f98bbd0.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-59e8c78f.elementor-column.elementor-col-33.elementor-inner-column > div > div > div.elementor-element.elementor-element-c11c81c.elementor-widget.elementor-widget-heading > div > p').text()
    const tested = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-53a7df09.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-68c970ce.elementor-widget.elementor-widget-heading > div > p').text()
    const recovered = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-12cd577.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-0d2a255.elementor-widget.elementor-widget-heading > div > p').text()
    const deceased = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-6f98bbd0.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-571da723.elementor-column.elementor-col-33.elementor-inner-column > div > div > div.elementor-element.elementor-element-b99363d.elementor-widget.elementor-widget-heading > div > p').text()
    const hospitalised = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-77e49a92.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-88a6746.elementor-widget.elementor-widget-heading > div > p').text()
    const tested24hours = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-2f543d91.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-7bba3929.elementor-widget.elementor-widget-heading > div > p').text()
    const infected24hours = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-608ab178.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-37b7aa3c.elementor-widget.elementor-widget-heading > div > p').text()
    const deceased24hours = $('#main > div > div > div > section.elementor-element.elementor-element-4953d8ff.elementor-section-full_width.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-top-section > div.elementor-container.elementor-column-gap-no > div > div > div > div > section.elementor-element.elementor-element-3847b70.elementor-hidden-desktop.elementor-hidden-tablet.elementor-section-boxed.elementor-section-height-default.elementor-section-height-default.elementor-section.elementor-inner-section > div > div > div.elementor-element.elementor-element-67a58fd.elementor-column.elementor-col-16.elementor-inner-column > div > div > div.elementor-element.elementor-element-aa6dae2.elementor-widget.elementor-widget-heading > div > p').text()

const toInt = (string) => Number(string.replace('.', ''))

    const now = new Date();

    const data = {
        infected: toInt(infected),
        recovered: toInt(recovered),
        deceased: toInt(deceased),
        tested: toInt(tested),
        hospitalised: toInt(hospitalised),
        tested24hours: toInt(tested24hours),
        infected24hours: toInt(infected24hours),
        deceased24hours: toInt(deceased24hours),
        sourceUrl: 'https://covid19.rs/homepage-english/',
        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
        readMe: 'https://github.com/zpelechova/covid-ps/blob/master/README.md'
    };
    console.log(data)

    let latest = await kvStore.getValue(LATEST);
    if (!latest) {
        await kvStore.setValue('LATEST', result);
        latest = result;
    }
    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({}, result);
    delete actual.lastUpdatedAtApify;

    if (JSON.stringify(latest) !== JSON.stringify(actual)) {
        await dataset.pushData(result);
    }

    await kvStore.setValue('LATEST', result);
    await Apify.pushData(result);
}
);