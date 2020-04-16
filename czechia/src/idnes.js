const Apify = require("apify");
const cheerio = require("cheerio");
const getDataFromIdnes = async ()=>{
    let infectedByBabisNewspapers;
    try {
        const response = await Apify.utils.requestAsBrowser({
            url: "https://www.idnes.cz/",
            proxyUrl: Apify.getApifyProxyUrl({groups: ["SHADER"]}),
            abortFunction: () => false,
        });
        const $ = await cheerio.load(response.body);
        const liList = $("#megapruh ul.megapruh-counts li");
        const totalInfected = $(liList).eq(1).find("b").html();
        const totalDeaths = $(liList).eq(3).find("b").html();
        const totalCured = $(liList).eq(2).find("b").html();
        const totalTested = $(liList).eq(0).find("b").html();

        const localeTextNumberToInt = txt => parseInt(txt.replace("&#xFFFD;", ""), 10);
        infectedByBabisNewspapers = {
            totalInfected: localeTextNumberToInt(totalInfected),
            totalDeaths: localeTextNumberToInt(totalDeaths),
            totalCured: localeTextNumberToInt(totalCured),
            totalTested: localeTextNumberToInt(totalTested),
        }
    } catch (e) {
        console.log("Could not get data from Idnes", e);
    }
    return  infectedByBabisNewspapers;
};

module.exports = getDataFromIdnes;
