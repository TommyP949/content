// Common functions script
// =======================
// This script will be appended to each server script before being executed.
// Place here all common functions you'd like to share between server scripts.

/**
 * Checks if the given string represents a valid IPv4 address
 * @param {String} ip - the string to check
 * @returns {Boolean} true if valid IPv4 address
 */
function isIp(ip) {
  var d = ip.split('.'), i = d.length;
  if (i !== 4) {
    return false;
  }
  var ok = true;
  while (i-- && ok) {
    ok = d[i].length !== 0 && !isNaN(parseInt(d[i])) && d[i] > -1 && d[i] < 256;
  }
  return ok;
}

var entryTypes = {note: 1, downloadAgent: 2, file: 3, error: 4, pinned: 5, userManagement: 6, image: 7, plagroundError: 8};
var formats = {table: 'table', json: 'json', text: 'text', dbotResponse: 'dbotCommandResponse', markdown: 'markdown'};
var brands = {xfe: 'xfe', vt: 'virustotal', cy: 'cylance', wf: 'wildfire', cs: 'crowdstrike-intel'};
var providers = {xfe: 'IBM X-Force Exchange', vt: 'VirusTotal', cy: 'Cylance', wf: 'WildFire', cs: 'CrowdStrike'};

/**
 * Returns the name of the file as stored in our investigation artifacts on disk.
 * This should be used when sending files to d2 scripts as you can see in StaticAnalyze.
 * @param {String} entryId - the entry ID containing the file
 * @returns {String} the name of the file in our artifact repository
 */
function fileNameFromEntry(entryId) {
  var parts = entryId.split('@');
  if (parts.length !== 2) {
    return null;
  }
  var res = executeCommand('getEntry', {id: entryId});
  if (res && Array.isArray(res) && res.length === 1) {
    return parts[1] + '_' + res[0].FileID;
  }
  return null;
}

/**
 * Closes the current investigation
 * @param {Object} args - arguments for the close (what happened, damange, etc.)
 * @returns {Array} an array with error entry if there is an error or empty array
 */
function closeInvestigation(args) {
  return executeCommand('closeInvestigation', args);
}

// Thresholds for the various reputation services to mark something as positive
var thresholds = {xfeScore: 3, vtPositives: 10, vtPositiveUrlsForIP: 10};

/**
 * Checks if the given entry from a URL reputation query is positive (known bad)
 * @param {Object} entry - reputation entry
 * @returns {Boolean} true if positive, false otherwise
 */
function positiveUrl(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    var c = entry.Contents;
    if (entry.Brand === brands.xfe && c && c.url.result.score && c.url.result.score > thresholds.xfeScore) {
      return true;
    } else if (entry.Brand === brands.vt && c && c.positives && c.positives > thresholds.vtPositives) {
      return true;
    } else if (entry.Brand === brands.cs && c && c.length && c[0].indicator && (c[0].malicious_confidence === 'high' || c[0].malicious_confidence === 'medium')) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if the given entry from a file reputation query is positive (known bad)
 * @param {Object} entry - reputation entry
 * @returns {Boolean} true if positive, false otherwise
 */
function positiveFile(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    var c = entry.Contents;
    if (entry.Brand === brands.xfe && c && c.malware.family) {
      return true;
    } else if (entry.Brand === brands.vt && c && c.positives && c.positives > thresholds.vtPositives) {
      return true;
    } else if (entry.Brand === brands.wf && c && c.wildfire && c.wildfire.file_info) {
      return c.wildfire.file_info.malware === 'yes';
    } else if (entry.Brand === brands.cy && c) {
      var k = Object.keys(c);
      if (k && k.length > 0) {
        var v = c[k[0]];
        if (v && v.generalscore) {
          return v.generalscore < -0.5;
        }
      }
    } else if (entry.Brand === brands.cs && c && c.length && c[0].indicator && (c[0].malicious_confidence === 'high' || c[0].malicious_confidence === 'medium')) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if the given entry from an IP reputation query is positive (known bad)
 * @param {Object} entry - reputation entry
 * @returns {Boolean} true if positive, false otherwise
 */
function positiveIP(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    var c = entry.Contents;
    if (entry.Brand === brands.xfe && c && c.reputation.score && c.reputation.score > thresholds.xfeScore) {
      return true;
    } else if (entry.Brand === brands.vt && c && c.detected_urls) {
      var positives = 0;
      for (var i = 0; i < c.detected_urls.length; i++) {
        if (c.detected_urls[i].positives > thresholds.vtPositives) {
          positives++;
        }
      }
      return positives > thresholds.vtPositiveUrlsForIP;
    } else if (entry.Brand === brands.cs && c && c.length && c[0].indicator && (c[0].malicious_confidence === 'high' || c[0].malicious_confidence === 'medium')) {
      return true;
    }
  }
  return false;
}

/**
 * Display CrowdStrike Intel results in Markdown
 * @param {Object} entry - reputation entry
 * @returns {Object} the markdown entry
 */
function shortCrowdStrike(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    var c = entry.Contents;
    if (entry.Brand === brands.cs && c && c.length && c[0].indicator) {
      var csRes = '## CrowdStrike Falcon Intelligence';
      csRes += '\n\n### Indicator - ' + c[0].indicator;
      if (c[0].labels && c[0].labels.length) {
        csRes += '\n### Labels';
        csRes += '\nName|Created|Last Valid';
        csRes += '\n----|-------|----------';
        for (var l = 0; l < c[0].labels.length; l++) {
          csRes += '\n' + c[0].labels[l].name + '|' + new Date(c[0].labels[l].created_on * 1000) + '|' + new Date(c[0].labels[l].last_valid_on * 1000);
        }
      }
      if (c[0].relations && c[0].relations.length) {
        csRes += '\n### Relations';
        csRes += '\nIndicator|Type|Created|Last Valid';
        csRes += '\n---------|----|-------|----------';
        for (var r = 0; r < c[0].relations.length; r++) {
          csRes += '\n' + c[0].relations[r].indicator + '|' + c[0].relations[r].type + '|' + new Date(c[0].relations[r].created_date * 1000) + '|' + new Date(c[0].relations[r].last_valid_date * 1000);
        }
      }
      return {ContentsFormat: formats.markdown, Type: entryTypes.note, Contents: csRes};
    }
  }
  return entry;
}

/**
 * Formats a URL reputation entry into a short table
 * @param {Object} entry - reputation entry
 * @returns {Object} the table entry
 */
function shortUrl(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    var c = entry.Contents;
    if (entry.Brand === brands.xfe && c) {
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        Country: c.country, MalwareCount: c.malware.count, A: c.resolution.A ? c.resolution.A.join(',') : '',
        AAAA: c.resolution.AAAA ? c.resolution.AAAA.join(',') : '', Score: c.url.result.score,
        Categories: c.url.result.cats ? Object.keys(c.url.result.cats).join(',') : '',
        URL: c.url.result.url, Provider: providers.xfe, ProviderLink: 'https://exchange.xforce.ibmcloud.com/url/' + c.url.result.url
      }};
    } else if (entry.Brand === brands.vt && c) {
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        ScanDate: c.scan_date, Positives: c.positives, Total: c.total, URL: c.url, Provider: providers.vt, ProviderLink: c.permalink
      }};
    } else if (entry.Brand === brands.cs && c && c.length && c[0].indicator) {
      return shortCrowdStrike(entry);
    }
  }
  return entry;
}

/**
 * Formats a file reputation entry into a short table
 * @param {Object} entry - reputation entry
 * @returns {Object} the table entry
 */
function shortFile(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    var c = entry.Contents;
    if (entry.Brand === brands.xfe && entry.Contents) {
      var cm = c.malware;
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        Family: cm.family, MIMEType: cm.mimetype, MD5: cm.md5 ? cm.md5.substring(2) : '',
        CnCServers: cm.origins.CnCServers.count, DownloadServers: cm.origins.downloadServers.count,
        Emails: cm.origins.emails.count, ExternalFamily: cm.origins.external && cm.origins.external.family ? cm.origins.external.family.join(',') : '',
        ExternalCoverage: cm.origins.external.detectionCoverage, Provider: providers.xfe,
        ProviderLink: 'https://exchange.xforce.ibmcloud.com/malware/' + cm.md5.replace(/^(0x)/,"")
      }};
    } else if (entry.Brand === brands.vt && entry.Contents) {
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        Resource: c.resource, ScanDate: c.scan_date, Positives: c.positives, Total: c.total, SHA1: c.sha1, SHA256: c.sha256, Provider: providers.vt, ProviderLink: c.permalink
      }};
    } else if (entry.Brand === brands.cy && entry.Contents) {
      var k = Object.keys(entry.Contents);
      if (k && k.length > 0) {
        var v = entry.Contents[k[0]];
        if (v) {
          return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
            Status: v.status, Code: v.statuscode, Score: v.generalscore, Classifiers: JSON.stringify(v.classifiers), ConfirmCode: v.confirmcode, Error: v.error, Provider: providers.cy
          }};
        }
      }
    } else if (entry.Brand === brands.wf && entry.Contents && entry.Contents.wildfire && entry.Contents.wildfire.file_info) {
      var c = entry.Contents.wildfire.file_info;
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        Type: c.filetype, Malware: c.malware, MD5: c.md5, SHA256: c.sha256, Size: c.size, Provider: providers.wf
      }};
    } else if (entry.Brand === brands.cs && c && c.length && c[0].indicator) {
      return shortCrowdStrike(entry);
    }
  }
  return entry;
}

/**
 * Formats an ip reputation entry into a short table
 * @param {Object} entry - reputation entry
 * @returns {Object} the table entry
 */
function shortIP(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    var c = entry.Contents;
    if (entry.Brand === brands.xfe && entry.Contents) {
      var cr = c.reputation;
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        IP: cr.ip, Score: cr.score, Geo: cr.geo && cr.geo['country'] ? cr.geo['country'] : '',
        Categories: cr.cats ? JSON.stringify(cr.cats) : '', Provider: providers.xfe
      }};
    } else if (entry.Brand === brands.vt && entry.Contents) {
      var positives = 0;
      for (var i = 0; i < entry.Contents.detected_urls.length; i++) {
        if (entry.Contents.detected_urls[i].positives > thresholds.vtPositives) {
          positives++;
        }
      }
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        DetectedURLs: positives, Provider: providers.vt
      }};
    } else if (entry.Brand === brands.cs && c && c.length && c[0].indicator) {
      return shortCrowdStrike(entry);
    }
  }
  return entry;
}

/**
 * Formats a domain reputation entry into a short table
 * @param {Object} entry - reputation entry
 * @returns {Object} the table entry
 */
function shortDomain(entry) {
  if (entry.Type !== entryTypes.error && entry.ContentsFormat === formats.json) {
    if (entry.Brand === brands.vt && entry.Contents) {
      var c = entry.Contents;
      var positives = 0;
      for (var i = 0; i < entry.Contents.detected_urls.length; i++) {
        if (entry.Contents.detected_urls[i].positives > 20) {
          positives++;
        }
      }
      return {ContentsFormat: formats.table, Type: entryTypes.note, Contents: {
        DetectedURLs: positives, Provider: providers.vt
      }};
    }
  }
  return entry;
}

/**
 * Sets severity an incident. The incident must be related to current investigation.
 * @param {Object} arg - has 2 keys, 'id' - the incident id, 'severity' - the new severity value (Critical, High, Medium etc.).
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function setSeverity(arg) {
  return executeCommand('setSeverity', arg);
}

/**
 * Sets fields of the incident. The incident must be related to current investigation and be the only incident in it.
 * @param {Object} args - has 5 optional keys: type, severity, details, incName and systems of the incident.
 *                        systems should follow this string template: '1.1.1.1,10.10.10.10'
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function setIncident(args) {
  return executeCommand('setIncident', args);
}

/**
 * Create a new incident with the fields specified, only if an incident with the same name does not exist as an active incident.
 * If an active incident with the same name exists, ignore the request.
 * @param {Object} args - has 5 optional keys: type, severity, details, incName and system of the incident.
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function createNewIncident(args) {
  return executeCommand('createNewIncident', args);
}

/**
 * Sets playbook according to type.
 * @param {String} type - the incident type, which the playbook is set accordingly.
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function setPlaybookAccordingToType(type) {
  return executeCommand('setPlaybookAccordingToType', {type: type});
}

/**
 * Sets Owner to an incident. The incident must be related to current investigation.
 * @param {Object} name - the owner user name.
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function setOwner(name) {
  return executeCommand('setOwner', { owner: name });
}

/**
 * Assigns a playbook task to a user.
 * @param {Object} arg - has 2 keys, 'id' - the task id, 'assignee' - assignee user name.
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function taskAssign(arg) {
  return executeCommand('taskAssign', arg);
}

/**
 * Sets task due date.
 * @param {Object} arg - has 2 keys, 'id' - the task id, 'dueDate' - time string in UTC format (To get current time use: 'new Date().toUTCString()').
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function setTaskDueDate(arg) {
  return executeCommand('setTaskDueDate', arg);
}

/**
 * Sets investigation playbook
 * @param {String} name - the playbook name.
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function setPlaybook(name) {
  return executeCommand('setPlaybook', { name: name });
}

/**
 * Adds task to Workplan
 * @param {Object} arg - has 5 keys:
 * 'name' - (mandatory) The new task's name.
 * 'description' - (optional) The new task's description.
 * 'script' - (optional) Name of script to be run by task.
 * 'addBefore' - (optional, refers to task id) Insert new task before specified task (when using this argument do not use afterTask)
 * 'addAfter' - (optional, refers to task id) Insert new task after specified task (when using this argument do not use beforeTask)
 * @returns {Array} in case of error will contain the error entry. In Case of success will return an empty array.
 */
function addTask(arg) {
  return executeCommand('addTask', arg);
}
