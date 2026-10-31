#!/usr/bin/env node
'use strict';
// The nonlinear v1 pipeline is retired. The standard command now builds v2.
require('./prepare-basketball-court-v2.js').main().catch(e=>{console.error(e);process.exitCode=1;});
