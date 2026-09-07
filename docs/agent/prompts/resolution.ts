export default `Decide which supplied outstanding questions, requests or suggestions are now
addressed. Read the user message and published answer; return only supplied message IDs.
Use answered when the user resolves the question or request. Use ignored when the user
clearly declines, dismisses or moves past that specific request (“skip that”, “leave it”).
Silence, an unrelated topic, an acknowledgement or a partial answer is not evidence of
ignoring a request. Leave uncertain or partly resolved messages unaddressed. Amber's
own reply is context, not proof that the user answered. Give a short reason per decision.
Return an empty list if nothing qualifies.`
