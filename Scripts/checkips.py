import re
import socket

strIpRegex = r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'

def is_valid_ipv4_address(address):
    try:
        socket.inet_pton(socket.AF_INET, address)
    except AttributeError:  # no inet_pton here, sorry
        try:
            socket.inet_aton(address)
        except socket.error:
            return False
        return address.count('.') == 3
    except socket.error:  # not a valid address
        return False
    return True

res = []
ips = []
badIps = []

data = demisto.args()['data'] if demisto.get(demisto.args(), 'data') else demisto.incidents()[0]['details']

if isinstance(data, list):
    ips = data[:]
else:
    for m in re.finditer(strIpRegex, data, re.I):
        ip = m.group(0)
        if ip in ips:
            continue
        if not is_valid_ipv4_address(ip):
            continue
        ips.append(ip)
for ip in ips:
    rep = demisto.executeCommand('ip', {'ip': ip})
    for r in rep:
        if positiveIp(r):
            badIps.append(ip)
            res.append(shortIp(r))

if len(res) > 0:
    res.extend(['yes', 'Found malicious IPs!'])
    currIps = demisto.get(demisto.context(), 'bad_ips')
    if currIps and isinstance(currIps, list):
        currIps += [i for i in badIps if i not in currIps]
    else:
        currIps = badIps
    demisto.setContext('bad_ips', currIps)
else:
    res.append('no')
    res.append('Only clean IPs found: \n' + '\n'.join(ips))

demisto.results(res)
