# Snapdeal AI First Intern — final submission

## Email ready to copy

**Subject:** Snapdeal AI First Intern — Mini Virtual KAM submission | Aditya Prakash

Hi Sourav,

Please find my submission for the Snapdeal AI First Intern — Mini Virtual KAM assignment: SellerSaathi, a browser-based, two-way voice assistant for sellers investigating a sales decline.

- **Live Demo:** https://seller-saathi.onrender.com/
- **Demo Video (Google Drive):** https://drive.google.com/file/d/1e9Ia4TPL4iy04mf-2ACDjSAiQUYnis8y/view?usp=sharing
- **GitHub:** https://github.com/ad8ya089/seller-saathi

SellerSaathi uses evidence-based sales diagnosis to recommend practical recovery actions. It asks for explicit seller consent before saving a plan, with clear action owners, due dates and a follow-up checkpoint. The repository documents the technical approach and assumptions.

The application uses synthetic data and does not integrate with Snapdeal's internal systems. Saved plans are demo records only.

To try it, open the live demo in Chrome, allow microphone access and click “Call Virtual KAM.” The Render demo may take a little time to wake after inactivity.

Thank you for reviewing my submission. I would be happy to walk through the implementation and design decisions.

Best regards,
Aditya Prakash

## Final submission checklist

Unchecked items are checks to complete before sending, not claims of verification.

### Working demo

- [x] Final demo URL included: https://seller-saathi.onrender.com/
- [ ] Open the URL in a signed-out browser and on mobile data; allow time for Render to wake.
- [ ] Complete a real English voice call: AI greeting, seller query, targeted follow-up questions, evidence-based diagnosis, two or three practical actions, explicit consent, saved demo plan and closing summary.
- [ ] Confirm that action owners, due dates and the follow-up checkpoint are visible, and that the synthetic-data disclosure is clear.

### 1–2 minute real voice recording

- [x] User-supplied video URL included: https://drive.google.com/file/d/1e9Ia4TPL4iy04mf-2ACDjSAiQUYnis8y/view?usp=sharing
- [ ] Confirm the final recording is 1–2 minutes and captures a real two-way voice conversation with audible seller and assistant audio.
- [ ] Confirm it shows diagnosis, practical recommendations, explicit seller acceptance and the resulting plan with follow-up ownership; no secrets are visible.
- [ ] Open the Drive link signed out and confirm the evaluator can play it without requesting access.

### One-page technical note — pending finalization

- [ ] Finalize the draft in `docs/08-submission-pack.md` §2 into a note of no more than one page.
- [ ] Cover the actual LLM, STT/TTS, voice workflow, deterministic diagnosis, guarded tools, consent checks, assumptions and limitations.
- [ ] Update historical deployment references to Render and confirm model names against the submitted configuration. Remove placeholders and omit unsupported latency, cost or evaluation claims.
- [ ] Clearly disclose synthetic data, no Snapdeal internal integration, and demo-only plan storage.
- [ ] Attach the finalized note or add its verified accessible link to the email before sending. No finalized note attachment or link was supplied; the email above makes no attachment claim.

### GitHub repository

- [x] Final repository URL included: https://github.com/ad8ya089/seller-saathi
- [ ] Open the repository signed out and confirm evaluator access.
- [ ] Confirm the submitted version includes reproducible setup instructions, `.env.example`, architecture/workflow documentation and synthetic-data assumptions, with no secrets in files or history.

### Final send check

- [ ] Reply in the existing assignment correspondence to retain the verified recipient address; no address has been invented here.
- [ ] Complete the technical note step, recheck all links and send manually.

## Reference and verification notes

- `docs/01-problem-analysis.md` §1 records the original brief's requirements and identifies the correspondence as Sourav's email. `docs/08-submission-pack.md` §1 addresses Sourav. These support the salutation; the original email itself was not available for direct review.
- The original `Snapdeal_AI_Voice_KAM_Assignment.docx` was not found in the repository or the targeted local/Drive searches. The documented brief requirements and existing submission pack were used as references.
- README and current deployment documentation report an author-tested hosted English voice flow and completed recording. This task did not independently verify live voice behavior, video duration or external sharing permissions.
- The supplied final links and current Render deployment take precedence over historical URL placeholders and AWS deployment references in the submission draft.
