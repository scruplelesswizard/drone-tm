"""App-side rate limiting (slowapi/limits), keyed by remote address.

Conservative placeholder thresholds on the endpoints named in todo.md's
audit (login, the presigned-URL endpoint, the ScaleODM webhook) - not
tuned against real traffic. Revisit once there's actual usage data;
picking different numbers without that is still a guess, just a
narrower one than having no limit at all.

Enforced app-side rather than at the ingress, since this chart's ingress
is a plain nginx Ingress resource today with no rate-limiting annotations
configured - app-side is the mechanism actually available.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
