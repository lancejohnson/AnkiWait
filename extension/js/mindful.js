// This is the main file for the Mindful Browsing Chrome extension.
// It is responsible for managing the browsing timeout, overlay, and wait timer.

Array.prototype.indexOf = function(value, keypath) {
	for (var i = 0; i < this.length; i++) {
    	var ele = this[i];
        if (keypath)
          ele = keypath.split('.').reduce((previous, current) => {
              if (previous && current in previous)
                  return previous[current];
              return null;
          }, ele);
        if ( ele && ele == value )
        	return i;
    }
    return -1;
};

function addClassName(ele, className) {
	if (ele)
		ele.classList.add(className);
}
function removeClassName(ele, className) {
	if (ele)
		ele.classList.remove(className);
}

(function() {
	var blockedUrlPatterns = [];
	var allowedUrlPatterns = [];
    var inspirations = [];

    var match = false;
    var href = window.location.href;
    var site_name = null;
    var inspiration = null;
    var was_in_timeout = false;
    var syncFinished = false;
    var localFinished = false;
    var timeouts;
    var currentPhoto;
    var base64;
	var waitTimeSeconds;
	var browseTimeMinutes;
	var quickResume;
	var currentDelay = 0;
	var waitIntervalId;
	var focusPollingIntervalId;
	var schedule;
	var limitation;
	var photoSettings;
	var pendingPhotoUpdate = false;

	/*
    Storage:
    {
        "blockedUrlPatterns": [
			{
				"urlPattern": "foo.com"
			}
		],
        "allowedUrlPatterns": [
			{
				"urlPattern": "foo.com"
			}
		],
        "inspirations": ["go for a walk", "etc"],
        "timeouts": [
            	{
					"urlPattern": "foo.com",
					"active": true,
					"exp_time": 1234532341231,  // ms since epoch when timeout expires
					"prev_timeouts": [ 1234532341231, 1234532341231, 1234532341231 ]  // start times of previous timeout periods
				}
        ],
        "currentPhoto": {
			"last_updated": 12312431242,
			"info": {
				"credit": "Chris Gin",
				"credit_url": "http://chrisgin.com",
				"url": "https://mindfulbrowsing.org/photos/2.jpg"
			}
        }
    }
	*/

    chrome.storage.sync.get(null, function(settings) {
      blockedUrlPatterns = settings.blockedUrlPatterns || [];
      allowedUrlPatterns = settings.allowedUrlPatterns || [];
      inspirations = settings.inspirations || {};
	  waitTimeSeconds = settings.waitTimeSeconds || 30;
	  browseTimeMinutes = settings.browseTimeMinutes || 10;
	  quickResume = settings.quickResume || { active: false };
	  schedule = settings.schedule || {};
	  limitation = settings.limitation || {};
      timeouts = settings.timeouts || {};
      currentPhoto = settings.currentPhoto || {};
	  photoSettings = settings.photo || {};
      initialized = true;
      syncFinished = true;
      initIfReady();
    });
    chrome.storage.local.get('mindfulbrowsing', function(settings) {
        if (settings && settings.mindfulbrowsing && settings.mindfulbrowsing.base64) {
            base64 = settings.mindfulbrowsing.base64 || {};
        } else {
            base64 = undefined;
        }
        localFinished = true;
        initIfReady();
    });
    var initIfReady = function() {
        if (localFinished && syncFinished) {
            init();
        }
    };
	
    var mindfulBrowsing = window.mindfulBrowsing || {};
    mindfulBrowsing.saveSettings = function() {
        // Save it using the Chrome extension storage API.
        if (initialized === true) {
            chrome.storage.sync.set({
                "timeouts": timeouts,
                "currentPhoto": currentPhoto,
            }, function() {
              // Notify that we saved.
            });
            chrome.storage.local.set({'mindfulbrowsing': {
                "base64": base64,
            }}, function() {
              // Notify that we saved.
            });
        }
    };
	mindfulBrowsing.trimTimeouts = function() {
		// necessary for new timeout version
		if( !(timeouts instanceof Array) ) {
			delete timeouts;
			timeouts = [];
			mindfulBrowsing.saveSettings();
		}
		
		var midnight = (new Date()).setHours(0,0,0,0);
		
		timeouts = timeouts.filter(function(timeout) {
			timeout.prev_timeouts = timeout.prev_timeouts.filter(function(prev_timeout) {
				return prev_timeout >= midnight;
			});
			return timeout.active || timeout.prev_timeouts.length > 0;
		});
		mindfulBrowsing.saveSettings();
	};
	mindfulBrowsing.isActive = function() {
		var now = new Date();
		
		if ( !schedule.active )
			return true;
		
		with (schedule.details) {
			if ( !weekdays[now.getDay()].active )
				return false
			
			var nowTime = lzero(now.getHours()) + ":" + lzero(now.getMinutes());
			if ( times.start < times.end ) {
				return times.start <= nowTime && nowTime < times.end;
			} else {
				return times.start <= nowTime || nowTime < times.end;
			}
		}
		
		function lzero(x) {
			return x > 9 ? x : "0" + x;
		}
		
		return true;
	};
    mindfulBrowsing.addBrowsingTimeout = function() {
        var now = new Date();
        var timeout_diff = (browseTimeMinutes*60000);
		var i = timeouts.indexOf(site_name, "urlPattern");
		if( i < 0 ) {
			timeouts.push({
				urlPattern: site_name,
				active: false,
				exp_time: 0,
				prev_timeouts: []
			});
			i = timeouts.length - 1;
		} 
		with (timeouts[i]) {
			active = true;
			exp_time = now.getTime() + timeout_diff;
			prev_timeouts.push(now.getTime());
		}
        mindfulBrowsing.saveSettings();
        was_in_timeout = true;
        setTimeout(mindfulBrowsing.addOverlayIfActive, timeout_diff);
		mindfulBrowsing.removeOverlay();
    };

    mindfulBrowsing.addOverlay = async function() {
	    inspiration = inspirations[Math.floor(Math.random() * inspirations.length)].title;
	    var body = document.body;

	    var ele = document.createElement("div");
	    ele.classList.add("hidden");
	    ele.id = "mindfulBrowsingConfirm";
	    var innerHTML = [
	        "<div class='mindfulBrowsingHeading' style='width: 50vw; margin: 0 auto; text-align: left; font-family: Helvetica, sans-serif;'>",
	        "<h1 id='mindfulBrowsingMessage' style='font-size: 50px;'></h1>",
	        "<h3 id='mindfulBrowsingNumSessions' style='font-size: 30px;'></h3>",
	        `<div id='ankiCardContainer' style='height: 500px; width: 100%; border: 0; border-radius: 3px;
	         padding: 6px; background: #000; color: #fff;'></div>`,
	        "</div>",
	        "<div class='mindfulBrowsingBody'>",
	        "<div class='timer' id='mindfulBrowsingWaitTimer'></div>",
	        "<div class='options hidden' id='mindfulBrowsingOptions'>",
	        "<a class='mindfulBtn' id='mindfulBrowsingContinue' href='#' style='margin-right: 20px; margin-bottom: 15px; display: inline-block;'>Yes, " + browseTimeMinutes + " minute" + (browseTimeMinutes > 1 ? "s" : "") + ".</a>",
	        "<a class='mindfulBtn' id='mindfulBrowsingLeave' href='javascript:window.open(location,\"_self\");window.close();' style='display: inline-block;'>Actually, nah.</a>",
	        "</div>",
	        "</div>"
	    ].join("");

	    if (quickResume.active) {
	        innerHTML += [
	            "<div class='mindfulBrowsingQuickResume' id='mindfulBrowsingQuickResumeButton'>",
	            "<h1>!</h1>",
	            "<h2>resume</h2>",
	            "</div>"
	        ].join("");
	    }

	    ele.innerHTML = innerHTML;
	    ele.style.background = "rgb(0,0,0)";
	    ele.style.fontFamily = "Helvetica, Arial, sans-serif";

	    if (photoSettings.active) {
	        ele.innerHTML += "<a href='" + currentPhoto.info.credit_url + "' id='mindfulBrowsingPhotoCredit'>Photo by " + currentPhoto.info.credit + "</a>";
	        if (!pendingPhotoUpdate && base64 != undefined) {
	            ele.style.background = "inherit";
	            ele.style.backgroundColor = "rgba(97, 144, 187, 1)";
	            ele.style.backgroundImage = "url(" + base64 + ")";
	        }
	    }
	    ele.style.backgroundSize = "cover";
	    ele.style.backgroundPosition = "center center";
	    ele.style.backgroundRepeat = "no-repeat";
	    document.body.appendChild(ele);
	    removeClassName(ele, "hidden");

	    async function loadCard() {
	        // Step 1: Load deck on open
	        await fetch("http://127.0.0.1:8765", {
	            method: "POST",
	            headers: { "Content-Type": "application/json" },
	            body: JSON.stringify({
	                action: "guiDeckReview",
	                version: 6,
	                params: {
	                    name: "Sanctuary"
	                }
	            })
	        });

	        // Step 1B: Get card information
	        const cardInfoResponse = await fetch("http://127.0.0.1:8765", {
	            method: "POST",
	            headers: { "Content-Type": "application/json" },
	            body: JSON.stringify({
	                action: "guiCurrentCard",
	                version: 6
	            })
	        });
	        const cardInfoData = await cardInfoResponse.json();

	        if (cardInfoData.error) {
	            document.getElementById("ankiCardContainer").innerHTML = `<p style="color: red;">Error: ${cardInfoData.error}</p>`;
	        } else if (cardInfoData.result) {
	            const question = cardInfoData.result.question;
	            const backContent = cardInfoData.result.answer.replace(question, '');
	            const buttons = cardInfoData.result.buttons;
	            const nextReviews = cardInfoData.result.nextReviews;

	            // Step 3: Show the question and start the card timer
	            document.getElementById("ankiCardContainer").innerHTML = `
	                <div style='font-family: Helvetica, sans-serif; background: black; color: white;'>
	                    <div style='padding: 10px; background: rgba(0,0,0,0.5); border-radius: 3px; font-size: 1.8em;'>
	                        <strong>Question:</strong> ${question}
	                    </div>
	                    <br>
	                    <div id='answer-container' style='display: none; padding: 10px; background: rgba(0,0,0,0.5);
	                     border-radius: 3px; font-size: 1.8em;'>
	                        <strong>Answer:</strong> ${backContent}
	                    </div>
	                    <button id='show-answer-button' style='padding: 10px; margin-top: 10px; border-radius: 3px;
	                     background: #007bff; color: #ffffff; border: none; cursor: pointer; font-size: 1.2em;'>Show Answer</button>
	                     <div id='answer-options' style='display: none; margin-top: 20px; justify-content: space-around;
	                      font-size: 1.2em;'>
	                        ${buttons.map((button, index) => `
	                            <div style='text-align: center;'>
	                                <div style='font-size: 0.8em; opacity: 0.8;'>${nextReviews[index]}</div>
	                                <button class='answer-button' data-ease='${button}' style='
	                                margin-right: 10px; padding: 5px 15px; font-size: inherit;
	                                 background: #007bff; color: #ffffff; border: none; cursor: pointer; border-radius: 6px;'>${button}</button>
	                            </div>
	                        `).join('')}
	                    </div>
	                </div>
	            `;

	            // Start card timer
	            await fetch("http://127.0.0.1:8765", {
	                method: "POST",
	                headers: { "Content-Type": "application/json" },
	                body: JSON.stringify({
	                    action: "guiStartCardTimer",
	                    version: 6
	                })
	            });

	            const showAnswerButton = document.getElementById('show-answer-button');
	            const answerContainer = document.getElementById('answer-container');
	            const answerOptions = document.getElementById('answer-options');
	            showAnswerButton.addEventListener('click', async () => {
	                // Show answer
	                await fetch("http://127.0.0.1:8765", {
	                    method: "POST",
	                    headers: { "Content-Type": "application/json" },
	                    body: JSON.stringify({
	                        action: "guiShowAnswer",
	                        version: 6
	                    })
	                });

	                answerContainer.style.display = 'block';
	                showAnswerButton.style.display = 'none';
	                answerOptions.style.display = 'flex';
	            });

	            const answerButtons = document.querySelectorAll('.answer-button');
	            // Handle Answer Buttons Click
	            answerButtons.forEach(button => {
	                button.addEventListener('click', async (event) => {
	                    const easeValue = event.target.getAttribute('data-ease');

	                    try {
	                        // Answer the card
	                        const response = await fetch("http://127.0.0.1:8765", {
	                            method: "POST",
	                            headers: { "Content-Type": "application/json" },
	                            body: JSON.stringify({
	                                action: "guiAnswerCard",
	                                version: 6,
	                                params: {
	                                    ease: parseInt(easeValue)
	                                }
	                            })
	                        });

	                        const responseData = await response.json();
	                        if (responseData.error) {
	                            alert(`Error: ${responseData.error}`);
	                        } else {
	                            // Load another card after answering
	                            loadCard();
	                        }
	                    } catch (err) {
	                        alert(`Error: ${err.message}`);
	                    }
	                });
	            });
	        }
	    }

	    // Initial card load
	    await loadCard();

	    // Attach event handlers for buttons
	    var btn = document.getElementById("mindfulBrowsingContinue");
	    btn.onclick = mindfulBrowsing.addBrowsingTimeout;

	    var resumeBtn = document.getElementById("mindfulBrowsingQuickResumeButton");
	    if (resumeBtn) resumeBtn.onclick = mindfulBrowsing.addBrowsingTimeout;

	    mindfulBrowsing.updateOverlay();
	};

	mindfulBrowsing.addOverlayIfActive = function() {
		if ( mindfulBrowsing.isActive() ) {
			mindfulBrowsing.addOverlay();
		}
	};
	mindfulBrowsing.removeOverlay = function() {
        var ele = document.getElementById("mindfulBrowsingConfirm");
		ele.classList.add("hidden");
		setTimeout(function() {
			ele.parentNode.removeChild(ele);
		}, 400);
	};
	mindfulBrowsing.updateOverlay = function() {
		var message;
        var go_verb = (was_in_timeout)? "stay on" : "spend time on";
		var limit = limitation.details.limit;
		var limit_hit = isLimitHit(site_name);
		
		if ( limit_hit ) {
			message = "You have reached your limit of  " + limit + "  view" + (limit > 1 ? "s" : "") + " per hour on  " + site_name;
		} else {
			message = "Do you want to " + go_verb + " " + site_name + "?";
			mindfulBrowsing.initWaitTimer();
		}
		document.getElementById("mindfulBrowsingMessage").innerHTML = message;
		
		var numSessions = 0;
		var i = timeouts.indexOf(site_name, "urlPattern");
		if ( i >= 0 ) {
			numSessions = timeouts[i].prev_timeouts.length;
		}
		if ( numSessions > 0 ) {
			document.getElementById("mindfulBrowsingNumSessions").innerHTML = "(You've had " + numSessions + " session" + (numSessions > 1 ? "s" : "") + " on this site today)";
		}
	};
	mindfulBrowsing.updateWaitTimerDisplay = function() {
		if(currentDelay > 0) {
			var ele = document.getElementById("mindfulBrowsingWaitTimer");
			if (ele)
				ele.innerHTML = currentDelay;
		} 
	};
	mindfulBrowsing.initWaitTimer = function() {
		currentDelay = waitTimeSeconds;		
		removeClassName(document.getElementById("mindfulBrowsingWaitTimer"), "hidden");
		addClassName(document.getElementById("mindfulBrowsingOptions"), "hidden");
		
		// Disable, hide, and prevent clicking the continue button initially
		var continueBtn = document.getElementById("mindfulBrowsingContinue");
		if (continueBtn) {
			continueBtn.disabled = true;
			addClassName(continueBtn, "hidden");
			continueBtn.style.pointerEvents = "none"; // Disable pointer events (clicks)
		}
	
		mindfulBrowsing.updateWaitTimerDisplay();
		setTimeout(function() {
			mindfulBrowsing.resumeWaitTimer();
		}, 500);
	};
	
	mindfulBrowsing.updateWaitTimer = function() {
		currentDelay -= 1;
		mindfulBrowsing.updateWaitTimerDisplay();
		if (currentDelay <= 0) {
			mindfulBrowsing.suspendWaitTimer();
			clearInterval(focusPollingIntervalId);
			addClassName(document.getElementById("mindfulBrowsingWaitTimer"), "hidden");
			removeClassName(document.getElementById("mindfulBrowsingOptions"), "hidden");
	
			// Enable, show, and allow clicking the continue button after countdown
			var continueBtn = document.getElementById("mindfulBrowsingContinue");
			if (continueBtn) {
				continueBtn.disabled = false;
				removeClassName(continueBtn, "hidden");
				continueBtn.style.pointerEvents = "auto"; // Re-enable pointer events (clicks)
			}
		}
	};	
	
	mindfulBrowsing.resumeWaitTimer = function() {
		mindfulBrowsing.suspendWaitTimer();
		waitIntervalId = setInterval(mindfulBrowsing.updateWaitTimer, 1000);
	};
	mindfulBrowsing.suspendWaitTimer = function() {
		clearInterval(waitIntervalId);
		waitIntervalId = null;
	};
	mindfulBrowsing.updateTabIsFocused = function(isFocused) {
		if(waitIntervalId) {			
			if(!isFocused)
				mindfulBrowsing.suspendWaitTimer();
		} else {
			if(isFocused)
				mindfulBrowsing.resumeWaitTimer();
		}
	};
    window.mindfulBrowsing = mindfulBrowsing;
	
	function isLimitHit(site) {
		if ( !limitation.active ) {
			return false;
		}
		var i = timeouts.indexOf(site, "urlPattern");
		if ( i < 0 ) {
			return false;
		}
		var period_hours = limitation.details.period_hours || 2;
		var limit_period_start = (new Date()).getTime() - period_hours * 60*60*1000;
		var limit = limitation.details.limit;
		var timeoutsWithinPeriod = timeouts[i].prev_timeouts.filter(function(prev_timeout) { return prev_timeout > limit_period_start; } ).length;
		return timeoutsWithinPeriod >= limit;
	}
	
	function matchesUrlPattern(urlPattern, url) {
		var regexPattern = urlPattern;
		regexPattern = regexPattern.replace(/\^/g, "\^");
		regexPattern = regexPattern.replace(/\$/g, "\$");
		regexPattern = regexPattern.replace(/\?/g, "\?");
		regexPattern = regexPattern.replace(/\//g, "\/");
		regexPattern = regexPattern.replace(/[\.]/g, "\\.");
		regexPattern = regexPattern.replace(/[*]/g, ".*");
		if ( !urlPattern.match(/^((http[s]?|ftp):\/\/|[^\w\d\-_])/i) ) regexPattern = "(?:^|[\\.\/])" + regexPattern;
		var regex = new RegExp(regexPattern, "i");
		var urlMatch = url.match(regex);
		if ( urlMatch ) {
			if ( urlMatch[0].match(/[\?#]/) ) {
				regexPattern = regexPattern + "(?:[\-\+=&;%@\\._]|$)";
			} else if ( urlMatch[0].match(/[\w\d\-_]$/) ) {
				regexPattern = regexPattern + "(?:[\\.\/]|$)";
			}
			regex = new RegExp(regexPattern);
			return regex.test(url);
		}
		return false;
	}
	
	function isAllowedUrl(url) {
		for (var p in allowedUrlPatterns) {
			if(matchesUrlPattern(allowedUrlPatterns[p].urlPattern, url))
				return true;
		}
		return false;
	}
	
	// heuristic
	function isMoreRestrictiveUrlPattern(testPattern, comparePattern) {
		// first test how they compare to each other as if they were urls themselves
		var compareMatchesTest = matchesUrlPattern(testPattern, comparePattern);
		var testMatchesCompare = matchesUrlPattern(comparePattern, testPattern);
		if ( compareMatchesTest == false && testMatchesCompare == true ) {
			return true;
		} else if ( compareMatchesTest == true && testMatchesCompare == false ) {
			return false;
		}
		// next compare their number of wildcards, more restrictive having fewer
		var compareNumWildcards = numWildcards(comparePattern);
		var testNumWildcards = numWildcards(testPattern);
		if ( testNumWildcards < compareNumWildcards ) {
			return true;
		} else if ( compareNumWildcards < testNumWildcards ) {
			return false;
		}
		// next compare the number of wildcards they have on their ends, more restrictive having fewer
		var compareNumTerminatingWildcards = numTerminatingWildcards(comparePattern);
		var testNumTerminatingWildcards = numTerminatingWildcards(testPattern);
		if ( testNumTerminatingWildcards < compareNumTerminatingWildcards ) {
			return true;
		} else if ( compareNumTerminatingWildcards < testNumTerminatingWildcards ) {
			return false;
		}
		// finally compare their lengths, more restrictive being longer
		return testPattern.length > comparePattern.length;
	}
	
	function numWildcards(pattern) {
		return (pattern.match(/\*/g) || []).length;
	}
	
	function numTerminatingWildcards(pattern) {
		return (startsWithWildcard(pattern) ? 1 : 0) + (endsWithWildcard(pattern) ? 1 : 0);
	}
	
	function startsWithWildcard(pattern) {
		return pattern.test(/^\*/);
	}
	
	function endsWithWildcard(pattern) {
		return pattern.test(/\*$/);
	}
	
	// simple linear analysis
	function getMostRestrictiveBlockedUrlPattern(url) {
		var mostRestrictivePattern = false;
		for ( var i in blockedUrlPatterns ) {
			blockedUrlPattern = blockedUrlPatterns[i].urlPattern;
			if(matchesUrlPattern(blockedUrlPattern, url)) {
				if(mostRestrictivePattern == false || (mostRestrictivePattern != blockedUrlPattern && isMoreRestrictiveUrlPattern(blockedUrlPattern, mostRestrictivePattern))) {
					mostRestrictivePattern = blockedUrlPattern;
				}
			}
		}
		return mostRestrictivePattern;
	}
	
    function init() {
        var now = new Date();
		
		// Load photo
		if (photoSettings && photoSettings.active) {
			
			var photoRotateTimeDiff = photoSettings.details.periods * photoSettings.details.period_value_seconds * 1000;
			
			if (base64 === undefined || currentPhoto.last_updated === undefined || currentPhoto.last_updated + photoRotateTimeDiff < now.getTime()) {
				var photo_index = Math.floor(Math.random() * window.mindfulBrowsing.photoInfo.photos.length);
				currentPhoto = {};
				currentPhoto.info = window.mindfulBrowsing.photoInfo.photos[photo_index];
				currentPhoto.last_updated = now.getTime();
				mindfulBrowsing.saveSettings();

				// Cache the photo offline.  
				var xmlHTTP = new XMLHttpRequest();
				xmlHTTP.open('GET', currentPhoto.info.url, true);
				xmlHTTP.responseType = 'arraybuffer';
				xmlHTTP.onload = function(e) {
					var arr = new Uint8Array(this.response);
					var raw = '';
					var i,j,subArray,chunk = 5000;
					for (i=0,j=arr.length; i<j; i+=chunk) {
					   subArray = arr.subarray(i,i+chunk);
					   raw += String.fromCharCode.apply(null, subArray);
					}
					var b64=btoa(raw);
					base64 = "data:image/jpeg;base64,"+b64;
					mindfulBrowsing.saveSettings();

					var ele = document.getElementById("mindfulBrowsingConfirm");
					if(ele)
						ele.style.backgroundImage = "url(" + base64 + ")";
					
					pendingPhotoUpdate = false;
				};
				pendingPhotoUpdate = true;
				xmlHTTP.send();
			}
		}
		
		if ( mindfulBrowsing.isActive() ) {
			if ( !isAllowedUrl(href) ) {
				var blockedUrlPattern = getMostRestrictiveBlockedUrlPattern(href);
				if ( blockedUrlPattern ) {
					match = true;
					site_name = blockedUrlPattern;
					// Check timeouts
					mindfulBrowsing.trimTimeouts();
					var j = timeouts.indexOf(site_name, "urlPattern");
					if (j >= 0) {
						with(timeouts[j]) {
							if(active) {
								if(exp_time < now.getTime()) {
									active = false;
									mindfulBrowsing.saveSettings();
								} else {
									match = false;
									was_in_timeout = true;
									setTimeout(mindfulBrowsing.addOverlayIfActive, timeouts[j].exp_time - now.getTime());
								}
							}
						}
					}
				}
			}
			if (match) {
				(function delayedAddOverlay() {
					if(document.body != null) {
						mindfulBrowsing.addOverlay();
					} else {
						setTimeout(delayedAddOverlay, 10);
					}
				})()
			}
		}
    }
})();

