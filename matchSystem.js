import mongoose from 'mongoose';
import semver from 'semver';
import { System, CVE, MatchResult } from '../../models.js'; // Pas het pad aan indien nodig

// Utility function to normalize strings
function normalizeString(str) {
    // Behoudt spaties en koppeltekens, converteert naar kleine letters en trimt
    return str.trim().toLowerCase();
}

// CVE Entry Class
class CVEEntry {
    constructor(cveData) {
        this.cve_id = cveData.cve_id;
        this.description = cveData.description;
        this.published_date = cveData.published_date;
        this.baseSeverity = cveData.baseSeverity;
        this.url = cveData.url;
        this.affected = cveData.affected;

        console.log(`CVE ${this.cve_id} affected products: ${JSON.stringify(this.affected, null, 2)}`);
    }

    matchesSoftware(softwareName, softwareVersion, options = { matchVersion: false }) {
        const normalizedSoftwareName = normalizeString(softwareName);
        console.log(`Checking software: "${softwareName}" (normalized: "${normalizedSoftwareName}")`);
        console.log(`Options: ${JSON.stringify(options)}`);

        for (const affected of this.affected) {
            const affectedProduct = normalizeString(affected.product);
            console.log(`Against affected product: "${affected.product}" (normalized: "${affectedProduct}")`);

            if (normalizedSoftwareName === affectedProduct) {
                if (options.matchVersion) {
                    if (softwareVersion && semver.valid(softwareVersion)) {
                        // Perform version match
                        console.log('Attempting version match');
                        const validSoftwareVersion = semver.valid(softwareVersion);
                        const validAffectedVersion = semver.valid(affected.lessThanOrEqual);

                        console.log(`Matching version: "${softwareVersion}" (valid: ${validSoftwareVersion}) <= "${affected.lessThanOrEqual}" (valid: ${validAffectedVersion})`);

                        if (validAffectedVersion) {
                            if (semver.lte(validSoftwareVersion, validAffectedVersion)) {
                                console.log('Version match successful');
                                return {
                                    matchType: 'Name and version match',
                                    affectedProduct: affected.product,
                                    lessThanOrEqual: affected.lessThanOrEqual,
                                };
                            } else {
                                console.log('Version does not satisfy the condition');
                            }
                        } else {
                            // Als affected.lessThanOrEqual geen geldige semver is, voer een naam-only match uit
                            console.log('Affected version is not a valid semver, performing name-only match');
                        }
                    } else {
                        // Geen geldige softwareVersion, voer een naam-only match uit
                        console.log('No valid software version provided, performing name-only match');
                    }
                }

                // Voer een naam-only match uit
                console.log('Performing name-only match');
                return {
                    matchType: 'Name match only',
                    affectedProduct: affected.product,
                    lessThanOrEqual: affected.lessThanOrEqual,
                };
            }
        }

        return null;
    }

    matchesKeywords(keywords) {
        const normalizedKeywords = keywords.map(normalizeString);
        const normalizedDescription = normalizeString(this.description);

        for (const keyword of normalizedKeywords) {
            if (normalizedDescription.includes(keyword)) {
                return {
                    matchType: 'Keyword match',
                    keyword,
                };
            }
        }
        return null;
    }
}

// System Entry Class
class SystemEntry {
    constructor(systemData) {
        this._id = systemData._id;
        this.customId = systemData.customId;
        this.installedSoftware = systemData.installedSoftware;
        this.keywords = systemData.keywords || [];
    }
}

// Matcher Class
class Matcher {
    constructor(systems, cves, options = { matchVersion: false }) {
        this.systems = systems.map(s => new SystemEntry(s));
        this.cves = cves.map(c => new CVEEntry(c));
        this.options = options;

        console.log(`Matcher initialized with options: ${JSON.stringify(this.options)}`);

        this.totalMatches = 0;
        this.nameOnlyMatches = 0;
        this.nameAndVersionMatches = 0;
        this.keywordMatches = 0;
        this.matchesPerSystem = {};
        this.matchesList = [];
    }

    performMatching() {
        for (const system of this.systems) {
            console.log(`\nSystem ${system._id} installed software: ${JSON.stringify(system.installedSoftware, null, 2)}`);
            this.matchesPerSystem[system._id] = [];

            for (const cve of this.cves) {
                let matched = false;

                // Check software matches
                for (const software of system.installedSoftware) {
                    const softwareName = software.name;
                    // Definieer ongeldige versies
                    const invalidVersions = ["unknown", "n/a"];
                    const softwareVersion = software.version && !invalidVersions.includes(software.version.toLowerCase()) ? software.version : null;

                    const matchInfo = cve.matchesSoftware(softwareName, softwareVersion, this.options);
                    if (matchInfo) {
                        this.totalMatches++;

                        if (matchInfo.matchType === 'Name match only') {
                            this.nameOnlyMatches++;
                        } else if (matchInfo.matchType === 'Name and version match') {
                            this.nameAndVersionMatches++;
                        }

                        const matchResult = {
                            systemId: system._id,
                            softwareName: software.name,
                            softwareVersion: software.version,
                            cve_id: cve.cve_id,
                            severity: cve.baseSeverity,
                            description: cve.description,
                            published_date: cve.published_date,
                            url: cve.url,
                            matchType: matchInfo.matchType,
                            affectedProduct: matchInfo.affectedProduct,
                            lessThanOrEqual: matchInfo.lessThanOrEqual,
                        };

                        this.matchesPerSystem[system._id].push(matchResult);
                        this.matchesList.push(matchResult);
                        matched = true;
                        // Blijf andere software controleren voor dezelfde CVE
                    }
                }

                if (matched) {
                    console.log(`CVE ${cve.cve_id} matched with system ${system._id}`);
                }
            }
        }
    }

    printResults() {
        console.log(`\nTotal matches: ${this.totalMatches}`);
        console.log(`Matches based only on software name: ${this.nameOnlyMatches}`);
        console.log(`Matches based on name and version: ${this.nameAndVersionMatches}`);
        console.log(`Matches based on keywords: ${this.keywordMatches}`);

        for (const [systemId, matches] of Object.entries(this.matchesPerSystem)) {
            console.log(`\nSystem: ${systemId}`);
            console.log(`Total matches for system: ${matches.length}`);
            for (const match of matches) {
                console.log(`- Matched CVE: ${match.cve_id}`);
                console.log(`  Match Type: ${match.matchType}`);
                if (match.softwareName) {
                    console.log(`  Software: ${match.softwareName}`);
                    console.log(`  Version: ${match.softwareVersion || 'N/A'}`);
                }
                if (match.keyword) {
                    console.log(`  Keyword: ${match.keyword}`);
                }
                console.log(`  CVE description: ${match.description}`);
                console.log(`  Affected product: ${match.affectedProduct || 'N/A'}`);
                console.log(`  LessThanOrEqual: ${match.lessThanOrEqual || 'N/A'}`);
            }
        }

        console.log('\nList of matches:');
        for (const match of this.matchesList) {
            let matchDetail = `${match.matchType}: CVE ${match.cve_id}`;
            if (match.softwareName) {
                matchDetail += ` matched with software "${match.softwareName}" (version: ${match.softwareVersion || 'N/A'})`;
            }
            if (match.keyword) {
                matchDetail += ` matched on keyword '${match.keyword}'`;
            }
            console.log(matchDetail);
        }
    }
}

// Function to Save Match Results to the Database
async function saveMatchResults(matchesPerSystem) {
    try {
        console.log("Saving match results to the database...");

        // Clear existing match results
        await MatchResult.deleteMany({});
        console.log("Existing match results cleared.");

        // Prepare match result documents
        const matchResultDocs = [];
        for (const [systemId, matches] of Object.entries(matchesPerSystem)) {
            if (matches.length > 0) {
                const matchResult = new MatchResult({
                    systemId: systemId, // systemId is already een ObjectId
                    matchedCVEs: matches.map(match => ({
                        cve_id: match.cve_id,
                        severity: match.severity,
                        description: match.description,
                        published_date: match.published_date,
                        url: match.url,
                        matchType: match.matchType,
                        affectedProduct: match.affectedProduct || null,
                        affectedVersion: match.lessThanOrEqual || null, // Mappen van 'lessThanOrEqual' naar 'affectedVersion'
                        softwareName: match.softwareName || null,
                        softwareVersion: match.softwareVersion || null,
                        keyword: match.keyword || null,
                    })),
                });
                matchResultDocs.push(matchResult);
            }
        }

        if (matchResultDocs.length === 0) {
            console.log("No match results to save.");
            return;
        }

        // Insert match results into the database
        const result = await MatchResult.insertMany(matchResultDocs);
        console.log(`Inserted ${result.length} match results into the database.`);
    } catch (error) {
        console.error('Error saving match results:', error);
    }
}

// Exported Function to Match CVEs with Systems
export async function matchCVEWithSystems(options = { matchVersion: false }) {
    try {
        console.log("Starting the matching process...");

        const systemsData = await System.find({});
        const cvesData = await CVE.find({});

        console.log(`Loaded ${systemsData.length} systems.`);
        console.log(`Loaded ${cvesData.length} CVEs.`);

        // Create the Matcher instance with options
        const matcher = new Matcher(systemsData, cvesData, options);
        matcher.performMatching();
        matcher.printResults();

        // Save match results to the database
        await saveMatchResults(matcher.matchesPerSystem);

        // Return the results
        return {
            totalMatches: matcher.totalMatches,
            nameOnlyMatches: matcher.nameOnlyMatches,
            nameAndVersionMatches: matcher.nameAndVersionMatches,
            keywordMatches: matcher.keywordMatches,
            matchesPerSystem: matcher.matchesPerSystem,
            matchesList: matcher.matchesList,
        };

    } catch (error) {
        console.error('Error matching CVEs with systems:', error);
        throw error;
    }
}
