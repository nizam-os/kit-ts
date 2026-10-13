---
'@nizam-os/resource-ui': minor
---

Add `resourceForm(resource, operation, options)`, a framework-free model of a create or an update
form over a declared resource. It holds the members the operation writes, or those `members` names,
and starts them on create from each default as a read gives it, an array's included, and on update
from the record the client read, each value as its input edits it. Its `validator` is a synchronous
Standard Schema that runs the declaration's own write validator and puts each issue on its field in
the words the server gives the same refusal, a blank value reading as required. `write(values)`
returns what the client's `create` or `update` takes: only the members the person changed, a cleared
input as `null`. `errors(error)` places a refused write's error objects on the fields their pointers
name, the rest for a banner. `@nizam-os/jsonapi-client` is a peer dependency.
