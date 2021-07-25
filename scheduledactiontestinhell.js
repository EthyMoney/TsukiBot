//------------------------------------------
//------------------------------------------


// !!! Maybe make a separate commands() function that just takes the command content and returns whatever it's output woulda been. 
// !!! Then send that with <client>.channels.cache.get('1234567890').send('Hello world.');
// !!! idk dude, I'm fukin cracked rn and this is kinda ass. we need a fukin message object, but it be mega gay and can't save.
// !!! the other option we have would be to call constructors up tha ass and create new objects with the client to generate a message object
// !!! that we can pass over to the normal commands processor. This would mean a chain of constructors for message(), guild(), author() and so on
// !!! So in summary, the 4am me says to you: go fuck yourself and good luck ;)

// Scheduled commands handler
async function scheduledCommandsEngine(message, action, frequency, channel) {
  if (action) {

    // Need to check for admin perms here
    // Also need to pull existing jobs for the guild to count them and make a new job ID
    // Useful later: <client>.channels.cache.get('1234567890').send('Hello world.');

    console.log("bru")
    action = action.toLowerCase();
    switch (action) {
      case "create":
        let helpText = "Enter your interval in HH:MM format. For example," + " every 30 minutes = 00:30 and every day = 24:00. The shortest allowed interval is 5 minutes (00:05)";
        let jobID = uniqid();
        let timeframeMS, channelID;
        let lastFired = 0;
        let command = message.content.match(/"([^']+)"/)[1];

        // Validate and process input
        if (command && frequency && channel) {
          // Validate the timeframe
          if (validateTime(frequency)) {
            let a = frequency.split(":");
            timeframeMS = ((+a[0]) * 60 * 60 + (+a[1]) * 60) * 1000;
            // Validate the command
            if (command) {
              if (message.mentions.channels.first()) {
                channelID = message.mentions.channels.first().id;
              }
              else {
                channelID = channel;
              }
              console.log(channelID);
              // Validate the channel
              if (channelID) {
                // Yay, all checks have passed! Let's get this confirmed with the user now
                let filter = m => m.author.id === message.author.id;
                message.channel.send(`Just to confirm, you want to run the command \`${command}\` in <#${channelID}> every ${(a[0] > 0) ? +a[0] + " hours " : ""}` +
                  `${(a[1] > 0) ? +a[1] + " minutes" : ""}. Does this look correct?`).then(() => {
                    message.channel.awaitMessages(filter, {
                      max: 1,
                      time: 60000,
                      errors: ['time']
                    })
                      .then(message => {
                        message = message.first();
                        if (message.content.toUpperCase() == 'YES' || message.content.toUpperCase() == 'Y') {
                          message.channel.send('Got it, your scheduled command task has been created! You can view all of your scheduled commands with `.tb schedule show`.');
                          // Send to the db
                          connp.none('INSERT INTO tsukibot.scheduled_actions(job_id, creation_ts, command, schedule, last_fired_ts, msg_object, channel_id) ' +
                            'VALUES(${jobID}, ${creationTS}, ${command}, ${scheduleMS}, ${lastFire}, ${msgObject}, ${channelID})', {
                            jobID: jobID,
                            creationTS: Date.now(),
                            command: command,
                            scheduleMS: timeframeMS,
                            lastFire: lastFired,
                            msgObject: JSON.stringify(message),
                            channelID: channelID
                          }).catch(err => {
                            console.log(err + "----schedule action creation db insertion error");
                            message.channel.send("OOPS nevermind. I ran into an issue when saving the scheduled command. Please try again later or notify us in the support server if this persists!");
                          });
                        } else if (message.content.toUpperCase() == 'NO' || message.content.toUpperCase() == 'N') {
                          message.channel.send("Alright, I won't save it. You can start over by running this command again.");
                        } else {
                          message.channel.send("Aborted: Invalid response. Expecting yes or no input.");
                        }
                      })
                      .catch(collected => {
                        console.log(collected);
                        message.channel.send("I didn't hear any response from you so I\'ll cancel this action. You can try again by re-running this command.");
                      });
                  });
              }
              else {
                message.reply("Invalid channel provided. Tag the channel like #Channel or provide the ID number you get by right clicking on it.");
              }
            }
            else {
              message.reply("Invalid command entered. Remember to enter the command just as you would normally in chat, but surround it with quotes like \"this\". Example: \".tb hmap\"");
            }
          }
          else {
            message.reply("Invalid timeframe entered. " + helpText);
            return;
          }
        }
        else {
          message.reply("Missing some arguments! Here\'s how to use this command:\n" + sendHelp());
        }


        break;

      case "delete":
        // First we gather all tasks, then find the ones that are due to run
        let res = await connp.any('SELECT * FROM tsukibot.scheduled_actions');
        console.log(res);
        let queuedToRun = [];
        res.forEach((item, index, array) => {
          if (Date.now() - item.last_fired_ts >= item.schedule) {
            // Let's grab the message object from the db
            let msg = JSON.parse(item.msg_object);
            // Update the channel propery with correct channel
            msg.channel = item.channel_id;
            // Forward the message to commands processor for normal handling
            commands(msg);
            // Now lets update the "last fired" timestamp of this job in the db so we can track this run
            connp.query('INSERT INTO tsukibot.scheduled_actions(last_fired_ts) VALUES($1) WHERE job_id = $2)', Date.now(), item.job_id);
          }
        });
        break;

      case "show":
        console.log("wttfff")
        let gay = await connp.any('SELECT * FROM tsukibot.scheduled_actions');
        console.log(gay);
        client.channels.cache.get('567970908451635202').send('Hello here!');

        break;
    }
  }
  // Do the normal tasks if no user action is provided (function called without user input)
  else {
    // First we gather all tasks, then find the ones that are due to run
    let res = await connp.any('SELECT * FROM tsukibot.scheduled_actions');
    console.log(res);
    let queuedToRun = [];
    res.forEach((item, index, array) => {
      if (Date.now() - item.last_fired_ts >= item.schedule) {
        //queuedToRun.push(item);
        // Let's build a message object based on the job so we can send it to the commands processor
        let msg = new Discord.Message(client, {
          id: 848465205919088650,
          type: 'DEFAULT',
          content: item.command,
          author: item.author_id,
          pinned: null,
          tts: null,
          embeds: null,
          attachments: null,
          nonce: "123" // idfk
        }, client.channels.cache.get(item.channel_id));
        // Send the generated message to the commands processor
        commands(msg);
        // Now lets update the "last fired" timestamp of this job in the db so we can track this run
        connp.query('INSERT INTO tsukibot.scheduled_actions(last_fired_ts) VALUES($1) WHERE job_id = $2)', Date.now(), item.job_id);
      }
    });
  }
}