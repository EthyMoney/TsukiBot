# Welcome to the Next Generation of TsukiBot!
This branch is the in-progress build of a brand-new rewrite of TsukiBot!
## Why?
The old codebase has become an absolute disaster and is nearly impossible to keep maintained and stable now that TsukiBot runs at the much greater scale that it now does. There are bugs that have existed for years that mostly have the poor design of the codebase to blame. Problems keep arising without detection and the fixes are becoming increasingly difficult and usually resulting in hacky workarounds. A large portion of the codebase has existed since early 2017 and hasn't changed since then. There's also many features and components that were written by me back in 2018 that are quite crude by current standards. I was very new to JavaScript back then and was writing this bot to learn it. Looking back at this code now, I can see how flawed a lot of my code is and I can see so many ways to do things better that I just didn't understand back when I wrote them. So, I think we are at a good spot to now attempt a full rewrite and get things back to happy and healthy state that is very maintainable and stable, along with having many new features that people have been waiting years for!
## The Goals and Milestones:
+ Full codebase rewrite from the ground up
+ Utilizing Typescript rather than plain JavaScript to improve maintainability and overall stability
+ Optimization and improvement of existing commands and components to use the latest Node.js features and best practices
+ Complete overhaul of the Discord.js implementations (unified message sender, better error handling, defined slash commands, new API features, etc.)
+ Several brand-new features that have been on the back burner for so long (price alerts, custom charts, personal saved charts, portfolio tracking, automated scheduled commands, coin ticker preferences with multiple same tickers, fiat currency preferences, and so much more!)
+ Improvements for overall performance and scalability (utilizing load balancing and clustering to split up the workload and keep performance reliable and consistent)
+ GPU accelerated charts rendering (this is more of a hosting hardware change, but it will be vital to the performance of the bot with charting being one of the most used features)
+ Implementation of a full testing and deployment suite that automates a lot of the development tasks and ensures the bot passes pre-defined test case to reduce the number of bugs that appear in production at runtime
<br><br>
<p align="center" font-weight="bold" font-size="25">
    The Next Generation is Coming
</p>
<p align="center" font-weight="bold" font-size="25">
    Are You Ready?
</p>
<p align="center">
  <img src="https://i.imgur.com/hsauPqd.png" width="8% height="auto">
</p>
