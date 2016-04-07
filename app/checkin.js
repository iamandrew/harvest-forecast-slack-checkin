"use strict";

if (process.env.NODE_ENV !== "production") {
    require("dotenv").load();
}

var moment = require("moment");

var forecast = require("./lib/forecast");
var peopleFilter = require("./lib/peoplefilter");
var lookup = require("./lib/lookup");
var activity = require("./lib/activity");
var personName = require("./lib/personname");
var personActivities = require("./lib/personactivities");
var personTimeOff = require("./lib/persontimeoff");
var conjunct = require("./lib/conjunct");
var slack = require("./lib/slack");

var options = {
    startDate: moment(),
    endDate: moment()
};

// skip if weekend
if (process.env.SKIP_IF_WEEKEND && (moment().day() === 6 || moment().day() === 0)) {
    console.log("It's weekend, skipping...");
    process.exit(); // eslint-disable-line no-process-exit
}

Promise.all([
    forecast.people(),
    forecast.projects(),
    forecast.clients(),
    forecast.assignments(options)
]).then(data => {
    let people = data[0];
    let projects = lookup(data[1]);
    let clients = lookup(data[2]);
    let assignments = data[3];

    // exclude persons
    people = peopleFilter.exclude(people, process.env.PEOPLE_EXCLUDE_FILTER);

    // sort persons alphabetically
    people.sort((a, b) => a.first_name.localeCompare(b.first_name));

    let femsg = [];
    let devmsg = [];
    let desmsg = [];
    let testmsg = [];

    people.forEach(p => {
        if (p.archvied == true) {
            return;
        }
        // get person activity for current day
        let personActivity = activity.get(p, assignments);
        if (personActivity.length === 0) {
            // no entry for person
            let text = `${personName(p)}    -  No entry for today.`;

            for(var i = 0; i < p.teams.length; i++) {
                if(p.teams[i] == 'Developer') {
                    devmsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Tester') {
                    testmsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Front-end') {
                    femsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Design') {
                    desmsg.push(text);
                    return;
                }
            }
        } else if (personActivity.length === 1 && personActivity[0].project_id === parseInt(process.env.PROJECT_ID_TIME_OFF)) {
            // person got time off and does nothing else
            let endDate = personTimeOff(personActivity);
            let text = `${personName(p)}    - Off today and will be back ${endDate.format("YYYY-MM-DD")}.`
            for(var i = 0; i < p.teams.length; i++) {
                if(p.teams[i] == 'Developer') {
                    devmsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Tester') {
                    testmsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Front-end') {
                    femsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Design') {
                    desmsg.push(text);
                    return;
                }
            }
        } else {
            // normal assignments (but ignore partial day time off)
            let activities = personActivities(personActivity, projects, clients);
            let text = `${personName(p)}    - Working on ${conjunct(activities)}.`;
            for(var i = 0; i < p.teams.length; i++) {
                if(p.teams[i] == 'Developer') {
                    devmsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Tester') {
                    testmsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Front-end') {
                    femsg.push(text);
                    return;
                }
                if(p.teams[i] == 'Design') {
                    desmsg.push(text);
                    return;
                }
            }
        }
    });

    // send as Slack msg
    slack.send({
        attachments: [
            {
                "fallback": `Synergy Studio Thursday 2016-04-07 according to Forecast`,
                "pretext": `Synergy Studio ${options.startDate.format("dddd YYYY-MM-DD")} according to <${process.env.FORECAST_TEAM_URL}|Forecast>...`,
                "mrkdwn_in": ["pretext"],
            },
            {
                "pretext": `Design`,
                "color": "#2ecc71",
                "mrkdwn_in": ["pretext", "text", "fields"],
                "fields": [
                    {
                        "value": desmsg.join("\n"),
                        "short": false
                    }
                ]
            },
            {
                "pretext": `Front-End`,
                "color": "#4aa3df",
                "mrkdwn_in": ["pretext", "text", "fields"],
                "fields": [
                    {
                        "value": femsg.join("\n"),
                        "short": false
                    }
                ]
            },
            {
                "pretext": `Developer`,
                "color": "#9b59b6",
                "mrkdwn_in": ["pretext", "text", "fields"],
                "fields": [
                    {
                        "value": devmsg.join("\n"),
                        "short": false
                    }
                ]
            },
            {
                "pretext": `Tester`,
                "color": "#34495e",
                "mrkdwn_in": ["pretext", "text", "fields"],
                "fields": [
                    {
                        "value": testmsg.join("\n"),
                        "short": false
                    }
                ]
            }
        ]
    });
}).catch(e => console.error(e));
