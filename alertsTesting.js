  //         } else if (command === 'createalert' || command === 'delete' || command === 'modify') {
  // priceAlertsEngine(message, command, code_in[1], code_in[2], code_in[3], code_in[4], code_in[5]);

  // ^^^^  this is the commands section

  // vvvv  here's the function

// async function priceAlertsEngine(message, command, coinID, price, alertdirection, expiry, deleteAll = true) {

//   let authorID = message.author.id;
//   let authorName = message.author.username;
//   let channel = message.channel;
//   let current = [];
//   let availableExpSymbols = ["h", "d", "m", "y"];

//   // Expiration value validation
//   if (expiry && command == "create") {
//     let selectedExpSymbol = expiry.toLowerCase().substr(-1);
//     let selectedExpParam = expiry.toLowerCase().slice(0, -1);
//     let validExpSymbol = availableExpSymbols.includes(selectedExpSymbol);
//     let validExpParam = typeof value === 'number';
//     if (!validExpParam || !validExpSymbol) {
//       channel.send("Invalid expiration provided.");
//       return;
//     }
//   }
//   else {
//     let expiry = -1; // no expiration
//   }



  // switch (command) {

  //   // * Works!
  //   case "createalert":
  //     // grab current alerts
  //     await connp.one("SELECT * FROM tsukibot.pricealerts where userid = $1;", [authorID], (res) => {
  //       //Check if current user array is empty or not and exit if it is
  //       if (res.alerts && res.alerts.length > 0) {
  //         // collect the current list if there is one
  //         current = JSON.parse(res.alerts);
  //       }
  //     });

  //     let alertJSON = {
  //       "coinID": coinID,
  //       "price": price,
  //       "direction": alertdirection,
  //       "creationTS": Date.now(),
  //       "expirationTS": expiry,
  //       "hasTriggered": false,
  //       "triggeredTS": "null"
  //     };

//       // add our new entry to db
//       current.push(alertJSON);
//       await connp.any(("INSERT INTO tsukibot.pricealerts(userid, alerts) VALUES($1,$2) ON CONFLICT(userid) DO UPDATE SET alerts = $2;"), [authorID, JSON.stringify(current)], (err, res) => {
//         if (err) { chalk.red.bold((err + "------price alert save error")); }
//         else {
//           console.log("new entry saved!");
//         }
//       });
//       break;


//     // * Works!
//     case "delete":
//       if (deleteAll) {
//         await connp.any("DELETE FROM tsukibot.pricealerts where userid = $1;", [authorID]);
//         break;
//       }
//       else {
//         // grab current alerts
//         await connp.one("SELECT * FROM tsukibot.pricealerts where userid = $1;", [authorID], (res) => {
//           //Check if current user array is empty or not and exit if it is
//           if (res.alerts && res.alerts.length > 0) {
//             // collect the current list if there is one
//             current = JSON.parse(res.alerts);
//           }
//         });
//       }

//       break;
//     case "modify":

//       break;
//     default:
//       console.log("we ded boisss");
//   }
// }

console.log(isNaN("kjjk"))